'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { StanceSelector } from '@/components/StanceSelector';
import { ReasoningCard, ReasoningOption } from '@/components/ReasoningCard';
import { ImpactToggle } from '@/components/ImpactToggle';
import { SubmissionGuidelines } from '@/components/SubmissionGuidelines';
import { CommentPreview } from '@/components/CommentPreview';
import { ShareDocket } from '@/components/ShareDocket';
import {
  generateCitizenBriefAction,
  analyzeDocketFromBriefAction,
  regenerateReasonCardAction,
  generateCommentDraft,
  forceReanalyzeDocket
} from '@/app/actions';
import {
  DocketAnalysis,
  Position,
  NoticeType,
  ReasonCard,
  ArgumentOption,
  CitizenBrief as CitizenBriefType
} from '@/lib/ai-generator';

type Step = 'loading' | 'stance' | 'reasoning' | 'drafting' | 'review';

/**
 * Extract agency abbreviation from docket ID.
 * Federal docket IDs typically follow: AGENCY-YEAR-TYPE-NUMBER
 * Examples: NCUA-2025-1137, USCBP-2025-0001, EPA-HQ-OAR-2023
 */
function extractAgencyFromDocketId(docketId: string): string {
  const firstSegment = docketId.split('-')[0];
  // Handle USCBP -> CBP case
  if (firstSegment === 'USCBP') return 'CBP';
  return firstSegment || 'Agency';
}

/**
 * Check if the comment period is closed based on deadline and openForComment status.
 * Returns true if comments are no longer being accepted.
 */
function isCommentPeriodClosed(analysis: DocketAnalysis | null): boolean {
  if (!analysis) return false;

  // First check API status - if explicitly false, period is closed
  if (analysis.openForComment === false) return true;

  // Then check deadline date
  const deadline = analysis.commentEndDate || analysis.commentingInstructions?.deadlineDate;
  if (deadline) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    // Compare dates (ignore time for deadline at end of day)
    deadlineDate.setHours(23, 59, 59, 999);
    return now > deadlineDate;
  }

  return false;
}

/**
 * Format deadline date for display.
 */
function formatDeadlineDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export default function DocketPage() {
  const params = useParams();
  const docketId = typeof params.id === 'string' ? decodeURIComponent(params.id) : 'USCBP-2025-0001';

  // Core state
  const [step, setStep] = useState<Step>('loading');
  const [analysis, setAnalysis] = useState<DocketAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Brief-first flow: Brief loads first, then analysis generates in background
  const [brief, setBrief] = useState<CitizenBriefType | null>(null);
  const [isBriefLoading, setIsBriefLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  // User selections
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [selectedArgumentIds, setSelectedArgumentIds] = useState<string[]>([]);
  const [impactExpertise, setImpactExpertise] = useState(false);
  const [impactLivelihood, setImpactLivelihood] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [cardCustomText, setCardCustomText] = useState<Record<string, string>>({}); // Custom text per card

  // UI state
  const [regeneratingCardId, setRegeneratingCardId] = useState<string | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [visibleCardCount, setVisibleCardCount] = useState(5); // Progressive disclosure: start with 5 cards
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // ============================================================
  // BRIEF-FIRST FLOW: Load brief first, then generate analysis in background
  // ============================================================
  useEffect(() => {
    const loadBriefAndAnalysis = async () => {
      try {
        // Step 1: Load the Citizen's Brief
        console.log(`[DocketPage] Loading Citizen's Brief for ${docketId}`);
        setIsBriefLoading(true);
        const briefResult = await generateCitizenBriefAction(docketId);
        setBrief(briefResult);
        setIsBriefLoading(false);
        setStep('stance'); // Show brief immediately, user can start reading

        // Step 2: Start generating analysis in background using the brief
        console.log(`[DocketPage] Starting brief-informed analysis in background`);
        setIsAnalysisLoading(true);
        const analysisResult = await analyzeDocketFromBriefAction(docketId, briefResult);
        setAnalysis(analysisResult);
        setIsAnalysisLoading(false);
        console.log(`[DocketPage] Analysis complete`);
      } catch (err) {
        console.error('[DocketPage] Error in brief-first flow:', err);
        setError('Failed to analyze this docket. Please try again.');
        setIsBriefLoading(false);
        setIsAnalysisLoading(false);
        setStep('stance');
      }
    };

    loadBriefAndAnalysis();
  }, [docketId]);

  // ============================================================
  // Get current reason cards based on notice type
  // ============================================================
  const getCurrentReasonCards = (): ReasonCard[] => {
    if (!analysis) return [];

    // For proposed_rule: use position-based cards
    if (analysis.noticeType === 'proposed_rule' && analysis.positions && selectedPosition) {
      return analysis.positions[selectedPosition]?.reasonCards || [];
    }

    // For pra_notice: combine all PRA factor cards
    if (analysis.noticeType === 'pra_notice' && analysis.praFactors) {
      return [
        ...analysis.praFactors.necessity.reasonCards,
        ...analysis.praFactors.burdenAccuracy.reasonCards,
        ...analysis.praFactors.quality.reasonCards,
        ...analysis.praFactors.burdenMinimization.reasonCards
      ];
    }

    // For rfi: combine all question response cards
    if (analysis.noticeType === 'rfi' && analysis.rfiQuestions) {
      return analysis.rfiQuestions.flatMap(q => q.responseCards);
    }

    // For general: use issue cards
    if (analysis.noticeType === 'general' && analysis.issueCards) {
      return analysis.issueCards;
    }

    // Fallback: try positions if available
    if (analysis.positions && selectedPosition) {
      return analysis.positions[selectedPosition]?.reasonCards || [];
    }

    return [];
  };

  const currentReasonCards: ReasonCard[] = getCurrentReasonCards();

  // Build a map of all arguments for easy lookup
  // Use compound key (cardId::argId) to ensure uniqueness across cards
  const argumentMap: Record<string, ArgumentOption> = {};
  if (analysis) {
    // Gather all reason cards based on notice type
    let allCards: ReasonCard[] = [];

    if (analysis.noticeType === 'proposed_rule' && analysis.positions) {
      Object.values(analysis.positions).forEach(pos => {
        allCards = allCards.concat(pos.reasonCards);
      });
    } else if (analysis.noticeType === 'pra_notice' && analysis.praFactors) {
      allCards = [
        ...analysis.praFactors.necessity.reasonCards,
        ...analysis.praFactors.burdenAccuracy.reasonCards,
        ...analysis.praFactors.quality.reasonCards,
        ...analysis.praFactors.burdenMinimization.reasonCards
      ];
    } else if (analysis.noticeType === 'rfi' && analysis.rfiQuestions) {
      allCards = analysis.rfiQuestions.flatMap(q => q.responseCards);
    } else if (analysis.noticeType === 'general' && analysis.issueCards) {
      allCards = analysis.issueCards;
    }

    allCards.forEach(card => {
      card.arguments.forEach(arg => {
        const uniqueId = `${card.id}::${arg.id}`;
        argumentMap[uniqueId] = arg;
      });
    });
  }

  // ============================================================
  // Handlers
  // ============================================================

  const handlePositionSelect = (position: Position) => {
    setSelectedPosition(position);
    // Clear previous selections when position changes
    setSelectedArgumentIds([]);
    setCardCustomText({});
    setVisibleCardCount(5); // Reset to show first 5 cards
  };

  const handleForceReanalyze = async () => {
    setIsReanalyzing(true);
    setError(null);
    try {
      console.log(`[DocketPage] Force reanalyzing ${docketId}`);
      const result = await forceReanalyzeDocket(docketId);
      setAnalysis(result);
      // Reset user selections since analysis changed
      setSelectedPosition(null);
      setSelectedArgumentIds([]);
      setCardCustomText({});
      setStep('stance');
      console.log(`[DocketPage] Force reanalysis complete`);
    } catch (err) {
      console.error('[DocketPage] Error force reanalyzing:', err);
      setError('Failed to reanalyze. Please try again.');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleCardCustomTextChange = (cardId: string, text: string) => {
    setCardCustomText(prev => ({ ...prev, [cardId]: text }));
  };

  const handleContinueToReasoning = () => {
    // For non-proposed_rule types, position is optional
    const needsPosition = analysis?.noticeType === 'proposed_rule';
    if (!needsPosition || selectedPosition) {
      setStep('reasoning');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleArgumentChange = (optionId: string, isChecked: boolean) => {
    setSelectedArgumentIds(prev =>
      isChecked ? [...prev, optionId] : prev.filter(id => id !== optionId)
    );
  };

  const handleRegenerateCard = useCallback(async (card: ReasonCard) => {
    if (!analysis) return;
    // For proposed_rule, require position; for others, use notice type
    if (analysis.noticeType === 'proposed_rule' && !selectedPosition) return;

    setRegeneratingCardId(card.id);
    try {
      const existingLabels = card.arguments.map(a => a.label);
      // Note: regenerateReasonCardAction needs updating to support notice types
      const newCard = await regenerateReasonCardAction(
        docketId,
        selectedPosition || 'mixed', // fallback for non-position types
        card.topic,
        existingLabels
      );

      // Update the analysis with the new card based on notice type
      setAnalysis(prev => {
        if (!prev) return prev;

        if (prev.noticeType === 'proposed_rule' && prev.positions && selectedPosition) {
          const updatedPositions = { ...prev.positions };
          const positionData = { ...updatedPositions[selectedPosition] };
          positionData.reasonCards = positionData.reasonCards.map(c =>
            c.id === card.id ? newCard : c
          );
          updatedPositions[selectedPosition] = positionData;
          return { ...prev, positions: updatedPositions };
        }

        // For PRA notices, update the appropriate factor
        if (prev.noticeType === 'pra_notice' && prev.praFactors) {
          const updatedFactors = { ...prev.praFactors };
          for (const factorKey of ['necessity', 'burdenAccuracy', 'quality', 'burdenMinimization'] as const) {
            updatedFactors[factorKey] = {
              ...updatedFactors[factorKey],
              reasonCards: updatedFactors[factorKey].reasonCards.map(c =>
                c.id === card.id ? newCard : c
              )
            };
          }
          return { ...prev, praFactors: updatedFactors };
        }

        // For RFI, update the question's response cards
        if (prev.noticeType === 'rfi' && prev.rfiQuestions) {
          const updatedQuestions = prev.rfiQuestions.map(q => ({
            ...q,
            responseCards: q.responseCards.map(c =>
              c.id === card.id ? newCard : c
            )
          }));
          return { ...prev, rfiQuestions: updatedQuestions };
        }

        // For general, update issue cards
        if (prev.noticeType === 'general' && prev.issueCards) {
          const updatedCards = prev.issueCards.map(c =>
            c.id === card.id ? newCard : c
          );
          return { ...prev, issueCards: updatedCards };
        }

        return prev;
      });

      // Clear any selections from this card since IDs changed
      setSelectedArgumentIds(prev =>
        prev.filter(id => !id.startsWith(`${card.id}::`))
      );
    } catch (err) {
      console.error('[DocketPage] Error regenerating card:', err);
    } finally {
      setRegeneratingCardId(null);
    }
  }, [docketId, selectedPosition, analysis]);

  // ============================================================
  // SECOND AI CALL: Generate final comment
  // ============================================================
  const handleGenerateDraft = async () => {
    // Position is only required for proposed_rule notice types
    const needsPosition = analysis?.noticeType === 'proposed_rule';
    if (!analysis || selectedArgumentIds.length === 0 || (needsPosition && !selectedPosition)) return;

    setStep('drafting');

    try {
      // Collect selected arguments
      const selectedArgs = selectedArgumentIds
        .map(id => argumentMap[id])
        .filter(Boolean);

      // Combine card-specific custom text with general custom input
      const cardCustomTextEntries = Object.entries(cardCustomText)
        .filter(([_, text]) => text.trim())
        .map(([cardId, text]) => {
          const card = currentReasonCards.find(c => c.id === cardId);
          return card ? `[${card.topic}]: ${text}` : text;
        });

      const allCustomText = [
        ...cardCustomTextEntries,
        customInput?.trim()
      ].filter(Boolean).join('\n\n');

      const draft = await generateCommentDraft(
        docketId,
        analysis.commentingInstructions,
        selectedArgs,
        {
          isExpert: impactExpertise,
          affectsLivelihood: impactLivelihood,
          customText: allCustomText || undefined
        },
        {
          noticeType: analysis.noticeType,
          position: selectedPosition || undefined
        }
      );

      setGeneratedDraft(draft);
      setStep('review');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[DocketPage] Error generating draft:', err);
      setError('Failed to generate comment draft. Please try again.');
      setStep('reasoning');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (step === 'review') {
      setStep('reasoning');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (step === 'reasoning') {
      setStep('stance');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.history.back();
    }
  };

  const [showCopyModal, setShowCopyModal] = useState(false);

  const handleCopy = () => {
    // Strip the <summary> block before copying (user shouldn't paste that)
    const cleanComment = generatedDraft.replace(/<summary>[\s\S]*?<\/summary>/, '').trim();
    navigator.clipboard.writeText(cleanComment);

    // If open for comment, show the modal to guide them to the submission page
    if (analysis?.openForComment) {
      setShowCopyModal(true);
    } else {
      // Fallback relative toast/alert if not open or flag missing
      alert("Comment copied to clipboard!");
    }
  };

  // ============================================================
  // RENDER: Loading State (Brief-first flow)
  // ============================================================
  if (step === 'loading') {
    return (
      <>
        <Header title="Preparing Brief..." subtitle="Please wait" onBack={() => window.history.back()} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="mb-6">
              <span className="material-symbols-outlined text-6xl text-indigo-500 animate-pulse">article</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Preparing Your Brief</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Our AI is reading the docket and preparing a plain-language summary for you...
            </p>
            <div className="mt-6 flex justify-center">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ============================================================
  // RENDER: Drafting State (generating final comment)
  // ============================================================
  if (step === 'drafting') {
    return (
      <>
        <Header title="Drafting Comment..." subtitle="Almost done" onBack={handleBack} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="mb-6">
              <span className="material-symbols-outlined text-6xl text-primary animate-spin">edit_document</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Generating Your Comment</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Assembling your selected arguments into a formal public comment...
            </p>
          </div>
        </main>
      </>
    );
  }

  // ============================================================
  // RENDER: Review State
  // ============================================================
  if (step === 'review') {
    return (
      <>
        <Header title="Review Comment" subtitle="Final Step" onBack={handleBack} />
        <CommentPreview
          draft={generatedDraft}
          onEdit={setGeneratedDraft}
          onBack={handleBack}
          onCopy={handleCopy}
          submissionEmail={analysis?.commentingInstructions.submissionEmail}
          onlineSubmission={analysis?.commentingInstructions.onlineSubmission}
          submissionMethodsDescription={analysis?.commentingInstructions.submissionMethodsDescription}
          docketId={docketId}
        />

        {/* Copy Success Modal */}
        {showCopyModal && (() => {
          const hasEmailSubmission = analysis?.commentingInstructions.submissionEmail &&
            analysis.commentingInstructions.submissionEmail !== 'NONE';
          const hasOnlineSubmission = analysis?.commentingInstructions.onlineSubmission !== false;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-scale-up">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-2xl">check</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Copied to Clipboard!</h3>
                  <p className="text-sm text-gray-500">
                    {hasEmailSubmission
                      ? `Your comment is ready. This docket accepts comments via email to ${analysis?.commentingInstructions.submissionEmail}.`
                      : hasOnlineSubmission
                        ? 'Your comment is ready. Click below to open the official submission page on Regulations.gov and paste your text.'
                        : 'Your comment is ready. Please submit through the appropriate channel.'
                    }
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Primary CTA: Email if available */}
                  {hasEmailSubmission && (
                    <a
                      href={`mailto:${analysis?.commentingInstructions.submissionEmail}?subject=${encodeURIComponent(`Public Comment: ${docketId}`)}&body=${encodeURIComponent(generatedDraft)}`}
                      className="flex items-center justify-center gap-2 w-full bg-primary text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/30"
                      onClick={() => setShowCopyModal(false)}
                    >
                      <span className="material-symbols-outlined text-sm">mail</span>
                      Send via Email
                    </a>
                  )}

                  {/* Online submission option */}
                  {hasOnlineSubmission && (
                    <a
                      href={`https://www.regulations.gov/commenton/${encodeURIComponent(docketId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 w-full font-bold py-3.5 px-4 rounded-xl transition-colors ${hasEmailSubmission
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-primary text-white hover:bg-blue-600 shadow-lg shadow-blue-500/30'
                        }`}
                      onClick={() => setShowCopyModal(false)}
                    >
                      {hasEmailSubmission ? 'Or Submit Online' : 'Go to Submission Page'}
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  )}

                  <button
                    onClick={() => setShowCopyModal(false)}
                    className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </>
    );
  }

  // ============================================================
  // RENDER: Main Flow (Stance Selection & Reasoning)
  // ============================================================
  return (
    <>
      <Header
        title={`Docket: ${docketId}`}
        subtitle="Public Commenting"
        onBack={handleBack}
      />

      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="relative flex flex-col w-full max-w-md mx-auto group/design-root">

          {/* Error Banner */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Comment Period Closed Warning */}
          {isCommentPeriodClosed(analysis) && (
            <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-300 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-600 text-xl">warning</span>
                <div className="flex-1">
                  <h3 className="font-bold text-amber-800 mb-1">Comment Period Closed</h3>
                  <p className="text-sm text-amber-700 mb-3">
                    {analysis?.commentEndDate || analysis?.commentingInstructions?.deadlineDate ? (
                      <>
                        The comment period for this docket ended on{' '}
                        <span className="font-semibold">
                          {formatDeadlineDate(analysis.commentEndDate || analysis.commentingInstructions?.deadlineDate || '')}
                        </span>.
                        Comments are no longer being accepted.
                      </>
                    ) : (
                      'The comment period for this docket has ended. Comments are no longer being accepted.'
                    )}
                  </p>
                  <a
                    href="/"
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">search</span>
                    Find Open Dockets
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Guidelines (always visible) */}
          <div className="px-4 pt-4 animate-slide-up">
            <SubmissionGuidelines
              docketId={docketId}
              agencyName={extractAgencyFromDocketId(docketId)}
              instructions={
                analysis?.commentingInstructions.requiredPoints?.join('. ') ||
                "Please refer to the official docket for submission instructions."
              }
              documentUrl={`https://www.regulations.gov/${analysis?.objectType || 'document'}/${encodeURIComponent(docketId)}`}
              deadline={
                analysis?.commentingInstructions?.deadline ||
                (analysis?.commentEndDate ? new Date(analysis.commentEndDate).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                }) : undefined)
              }
            />
          </div>

          {/* ============================================================ */}
          {/* STEP 1: Citizen's Brief & Stance Selection (Brief-First Flow) */}
          {/* ============================================================ */}
          {step === 'stance' && !isCommentPeriodClosed(analysis) && (
            <div className="px-4 pt-6 animate-slide-up">

              {/* Citizen's Brief - Prominently displayed (Brief-First Flow) */}
              {brief && (
                <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl overflow-hidden">
                  {/* Brief Header */}
                  <div className="p-4 border-b border-indigo-100">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
                        <span className="material-symbols-outlined">article</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">Citizen's Brief</span>
                        <span className="text-xs text-indigo-600 font-medium">
                          Plain-language explainer for this regulation
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Brief Content */}
                  <div className="p-4 space-y-5">
                    {/* Plain English Summary */}
                    <section>
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">summarize</span>
                        What This Proposes
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {brief.plainEnglishSummary}
                      </p>
                    </section>

                    {/* Context & Stakes */}
                    <section className="pt-3 border-t border-indigo-100">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">history</span>
                        Context & Stakes
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {brief.contextAndStakes}
                      </p>
                    </section>

                    {/* Impact Table */}
                    <section className="pt-3 border-t border-indigo-100">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">balance</span>
                        Who's Affected
                      </h4>
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-xs border-collapse min-w-[500px]">
                          <thead>
                            <tr className="bg-indigo-100/50">
                              <th className="text-left p-2 font-semibold text-indigo-900 rounded-tl-lg">Perspective</th>
                              <th className="text-left p-2 font-semibold text-green-700">Benefits</th>
                              <th className="text-left p-2 font-semibold text-red-700">Concerns</th>
                              <th className="text-left p-2 font-semibold text-amber-700 rounded-tr-lg">Uncertainties</th>
                            </tr>
                          </thead>
                          <tbody>
                            {brief.impactTable.map((row, idx) => (
                              <tr key={idx} className="border-t border-indigo-100">
                                <td className="p-2 font-medium text-gray-900">{row.perspective}</td>
                                <td className="p-2 text-gray-600">{row.potentialBenefits || '-'}</td>
                                <td className="p-2 text-gray-600">{row.potentialConcerns || '-'}</td>
                                <td className="p-2 text-gray-600">{row.keyUncertainties || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* How to Respond */}
                    <section className="pt-3 border-t border-indigo-100">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        How to Respond
                      </h4>
                      <div className="space-y-2 text-sm text-gray-700">
                        <p>
                          <span className="font-medium text-gray-900">Deadline:</span>{' '}
                          {brief.howToRespond.commentDeadline}
                        </p>
                        <p>
                          <span className="font-medium text-gray-900">Submit:</span>{' '}
                          {brief.howToRespond.whereToSubmit}
                        </p>
                        <div className="bg-white/70 p-3 rounded-lg border border-indigo-100 mt-2">
                          <p className="text-xs text-gray-600 mb-2">
                            {brief.howToRespond.whatMakesCommentsCount}
                          </p>
                          <p className="text-xs font-medium text-indigo-800 mb-1">Suggested angles:</p>
                          <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                            {brief.howToRespond.suggestedAngles.map((angle, idx) => (
                              <li key={idx}>{angle}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>

                    {/* One-Sentence Verdict */}
                    <section className="pt-3 border-t border-indigo-100">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">gavel</span>
                        Bottom Line
                      </h4>
                      <p className="text-sm text-gray-800 font-medium italic bg-white/70 p-3 rounded-lg border border-indigo-100">
                        "{brief.oneSentenceVerdict}"
                      </p>
                    </section>

                    {/* Glossary (if present) */}
                    {brief.glossary && brief.glossary.length > 0 && (
                      <section className="pt-3 border-t border-indigo-100">
                        <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">dictionary</span>
                          Key Terms
                        </h4>
                        <dl className="text-xs space-y-1">
                          {brief.glossary.map((item, idx) => (
                            <div key={idx} className="flex gap-2">
                              <dt className="font-semibold text-gray-900">{item.term}:</dt>
                              <dd className="text-gray-600">{item.definition}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}

                    {/* Link to original + brief timestamp */}
                    <div className="pt-3 border-t border-indigo-100 flex items-center justify-between">
                      <a
                        href={`https://www.regulations.gov/${analysis?.objectType || 'document'}/${encodeURIComponent(docketId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                        View original on Regulations.gov
                      </a>
                      <span className="text-xs text-gray-400">
                        Brief generated {new Date(brief.generatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Arguments Loading Indicator (Brief-First Flow) */}
              {isAnalysisLoading && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Generating argument options...</p>
                      <p className="text-xs text-blue-700">
                        Our AI is preparing targeted arguments based on the brief above. You can continue reading while this loads.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Analysis Ready Indicator */}
              {analysis && !isAnalysisLoading && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-green-600">check_circle</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900">Arguments ready!</p>
                      <p className="text-xs text-green-700">
                        {currentReasonCards.length} argument categories generated. Select your stance to continue.
                      </p>
                    </div>
                    <button
                      onClick={handleForceReanalyze}
                      disabled={isReanalyzing}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className={`material-symbols-outlined text-sm ${isReanalyzing ? 'animate-spin' : ''}`}>
                        {isReanalyzing ? 'progress_activity' : 'refresh'}
                      </span>
                      {isReanalyzing ? 'Reanalyzing...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              )}

              {/* For proposed_rule: Show stance selection */}
              {analysis?.noticeType === 'proposed_rule' && analysis.positions && (
                <>
                  {/* Explore Perspectives - Help undecided users */}
                  <details className="mb-6 group">
                    <summary className="cursor-pointer flex items-center gap-2 text-sm text-primary hover:text-blue-700 transition-colors">
                      <span className="material-symbols-outlined text-base group-open:rotate-90 transition-transform">
                        chevron_right
                      </span>
                      Not sure where you stand? Explore different perspectives
                    </summary>
                    <div className="mt-4 space-y-3 animate-fade-in">
                      {/* Support perspective */}
                      <div
                        className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100 cursor-pointer hover:bg-green-100 transition-colors"
                        onClick={() => handlePositionSelect('support')}
                      >
                        <span className="material-symbols-outlined text-green-600 mt-0.5">thumb_up</span>
                        <div>
                          <p className="text-sm font-medium text-green-800">Support</p>
                          <p className="text-xs text-green-700 mt-1">{analysis.positions.support.summary}</p>
                        </div>
                      </div>

                      {/* Mixed perspective */}
                      <div
                        className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => handlePositionSelect('mixed')}
                      >
                        <span className="material-symbols-outlined text-amber-600 mt-0.5">thumbs_up_down</span>
                        <div>
                          <p className="text-sm font-medium text-amber-800">Mixed</p>
                          <p className="text-xs text-amber-700 mt-1">{analysis.positions.mixed.summary}</p>
                        </div>
                      </div>

                      {/* Oppose perspective */}
                      <div
                        className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                        onClick={() => handlePositionSelect('oppose')}
                      >
                        <span className="material-symbols-outlined text-red-600 mt-0.5">thumb_down</span>
                        <div>
                          <p className="text-sm font-medium text-red-800">Oppose</p>
                          <p className="text-xs text-red-700 mt-1">{analysis.positions.oppose.summary}</p>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Stance Selector */}
                  <StanceSelector
                    value={selectedPosition}
                    onChange={handlePositionSelect}
                  />

                  {/* Position Summary Preview */}
                  {selectedPosition && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-fade-in">
                      <p className="text-sm text-gray-600 leading-relaxed">
                        <span className="font-medium text-gray-900">Why people {selectedPosition}:</span>{' '}
                        {analysis.positions[selectedPosition].summary}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* For non-proposed_rule: Show notice type context */}
              {analysis && analysis.noticeType !== 'proposed_rule' && (
                <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {analysis.noticeType === 'pra_notice' && 'Paperwork Reduction Act Notice'}
                        {analysis.noticeType === 'rfi' && 'Request for Information'}
                        {analysis.noticeType === 'general' && 'General Notice'}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {analysis.noticeType === 'pra_notice' && 'Comments should address the four PRA factors: necessity, burden accuracy, quality enhancement, and burden minimization.'}
                        {analysis.noticeType === 'rfi' && 'The agency is seeking input on specific questions. Select the topics you want to address.'}
                        {analysis.noticeType === 'general' && 'Select the issues you want to address in your comment.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue Button */}
              <div className="mt-8">
                <button
                  onClick={handleContinueToReasoning}
                  disabled={isAnalysisLoading || (analysis?.noticeType === 'proposed_rule' && !selectedPosition)}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-white font-bold shadow-lg transition-all ${
                    isAnalysisLoading || (analysis?.noticeType === 'proposed_rule' && !selectedPosition)
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-primary hover:bg-blue-600 shadow-blue-500/30"
                  }`}
                >
                  {isAnalysisLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      Generating Arguments...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">arrow_forward</span>
                      {analysis?.noticeType === 'proposed_rule' ? 'Choose My Arguments' : 'Select Response Topics'}
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">
                  {isAnalysisLoading
                    ? 'Arguments are being generated based on the brief above...'
                    : `${currentReasonCards.length || 0} ${analysis?.noticeType === 'proposed_rule' ? 'argument categories' : 'response topics'} available`
                  }
                </p>
              </div>

              {/* Share Widget */}
              <div className="mt-8 animate-fade-in delay-200">
                <ShareDocket
                  docketId={docketId}
                  docketTitle={analysis?.summary.split('.')[0]} // Rough guess at title if not explicit, but good enough
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 2: Argument Selection (Reason Cards) */}
          {/* ============================================================ */}
          {step === 'reasoning' && !isCommentPeriodClosed(analysis) && (
            <div className="px-4 pt-6 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-gray-900 tracking-tight text-xl font-bold leading-tight text-left">
                    Select Your Arguments
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Check the points that reflect your views
                  </p>
                </div>
                {/* Position badge for proposed_rule, notice type badge for others */}
                {analysis?.noticeType === 'proposed_rule' && selectedPosition ? (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedPosition === 'support' ? 'bg-green-100 text-green-700' :
                    selectedPosition === 'oppose' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedPosition}
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {analysis?.noticeType === 'pra_notice' ? 'PRA' :
                     analysis?.noticeType === 'rfi' ? 'RFI' : 'General'}
                  </span>
                )}
              </div>

              {/* Reason Cards - Progressive Disclosure */}
              {currentReasonCards.slice(0, visibleCardCount).map((card, idx) => {
                // Convert ReasonCard arguments to ReasoningOption format
                // Use compound key (cardId::argId) to ensure uniqueness across cards
                const options: ReasoningOption[] = card.arguments.map(arg => ({
                  id: `${card.id}::${arg.id}`,
                  label: arg.label,
                  expansion: arg.expansion
                }));

                return (
                  <ReasoningCard
                    key={card.id}
                    title={card.topic}
                    icon={card.icon}
                    iconColorClass={`bg-blue-100 text-primary`}
                    options={options}
                    selectedOptions={selectedArgumentIds}
                    onChange={handleArgumentChange}
                    defaultExpanded={idx === 0}
                    onRegenerate={() => handleRegenerateCard(card)}
                    isRegenerating={regeneratingCardId === card.id}
                    customText={cardCustomText[card.id] || ''}
                    onCustomTextChange={(text) => handleCardCustomTextChange(card.id, text)}
                  />
                );
              })}

              {/* Add Another Argument Button */}
              {currentReasonCards.length > visibleCardCount && (
                <button
                  onClick={() => setVisibleCardCount(prev => prev + 1)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 mb-4 text-sm font-medium text-primary bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  Add another argument category
                  <span className="text-xs text-blue-400">
                    ({currentReasonCards.length - visibleCardCount} more available)
                  </span>
                </button>
              )}

              <div className="h-px bg-gray-200 mx-4 my-6"></div>

              {/* Personal Impact Section */}
              <div className="pb-8">
                <h3 className="text-gray-900 tracking-tight text-xl font-bold leading-tight text-left mb-4">
                  Personal Impact
                </h3>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-6">
                  <ImpactToggle
                    label="Expertise"
                    description="I am a subject matter expert in this field."
                    checked={impactExpertise}
                    onChange={setImpactExpertise}
                  />
                  <div className="h-px bg-gray-100"></div>
                  <ImpactToggle
                    label="Livelihood"
                    description="This regulation directly impacts my job or business."
                    checked={impactLivelihood}
                    onChange={setImpactLivelihood}
                  />
                </div>
              </div>

              {/* Additional Comments */}
              <div className="pb-8">
                <h3 className="text-gray-900 tracking-tight text-xl font-bold leading-tight text-left mb-4">
                  Additional Comments
                </h3>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <label className="block text-sm text-gray-500 mb-2">
                    Add any specific qualifications, personal stories, or arguments not covered above.
                  </label>
                  <textarea
                    className="w-full h-32 p-3 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                    placeholder="e.g., 'I have been a travel agent for 15 years and have seen firsthand...'"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* Footer (reasoning step only) */}
      {step === 'reasoning' && !isCommentPeriodClosed(analysis) && (
        <Footer
          onNext={handleGenerateDraft}
          nextLabel={`Draft Comment (${selectedArgumentIds.length})`}
          isNextDisabled={selectedArgumentIds.length === 0}
          currentStep={2}
          totalSteps={3}
        />
      )}
    </>
  );
}
