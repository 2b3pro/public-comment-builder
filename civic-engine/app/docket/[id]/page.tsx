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
  analyzeDocketContent,
  regenerateReasonCardAction,
  generateCommentDraft
} from '@/app/actions';
import {
  DocketAnalysis,
  Position,
  ReasonCard,
  ArgumentOption
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

export default function DocketPage() {
  const params = useParams();
  const docketId = typeof params.id === 'string' ? decodeURIComponent(params.id) : 'USCBP-2025-0001';

  // Core state
  const [step, setStep] = useState<Step>('loading');
  const [analysis, setAnalysis] = useState<DocketAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const [visibleCardCount, setVisibleCardCount] = useState(3); // Progressive disclosure: start with 3 cards

  // ============================================================
  // FIRST AI CALL: Analyze docket on mount
  // ============================================================
  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        console.log(`[DocketPage] Starting docket analysis for ${docketId}`);
        const result = await analyzeDocketContent(docketId);
        setAnalysis(result);
        setStep('stance');
        console.log(`[DocketPage] Analysis complete`);
      } catch (err) {
        console.error('[DocketPage] Error analyzing docket:', err);
        setError('Failed to analyze this docket. Please try again.');
        setStep('stance'); // Still allow them to proceed with limited functionality
      }
    };

    loadAnalysis();
  }, [docketId]);

  // ============================================================
  // Get current position's reason cards
  // ============================================================
  const currentReasonCards: ReasonCard[] = analysis && selectedPosition
    ? analysis.positions[selectedPosition].reasonCards
    : [];

  // Build a map of all arguments for easy lookup
  // Use compound key (cardId::argId) to ensure uniqueness across cards
  const argumentMap: Record<string, ArgumentOption> = {};
  if (analysis) {
    Object.values(analysis.positions).forEach(pos => {
      pos.reasonCards.forEach(card => {
        card.arguments.forEach(arg => {
          const uniqueId = `${card.id}::${arg.id}`;
          argumentMap[uniqueId] = arg;
        });
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
    setVisibleCardCount(3); // Reset to show first 3 cards
  };

  const handleCardCustomTextChange = (cardId: string, text: string) => {
    setCardCustomText(prev => ({ ...prev, [cardId]: text }));
  };

  const handleContinueToReasoning = () => {
    if (selectedPosition) {
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
    if (!selectedPosition || !analysis) return;

    setRegeneratingCardId(card.id);
    try {
      const existingLabels = card.arguments.map(a => a.label);
      const newCard = await regenerateReasonCardAction(
        docketId,
        selectedPosition,
        card.topic,
        existingLabels
      );

      // Update the analysis with the new card
      setAnalysis(prev => {
        if (!prev) return prev;
        const updatedPositions = { ...prev.positions };
        const positionData = { ...updatedPositions[selectedPosition] };
        positionData.reasonCards = positionData.reasonCards.map(c =>
          c.id === card.id ? newCard : c
        );
        updatedPositions[selectedPosition] = positionData;
        return { ...prev, positions: updatedPositions };
      });

      // Clear any selections from this card since IDs changed
      // IDs use compound format: cardId::argId
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
    if (!selectedPosition || !analysis || selectedArgumentIds.length === 0) return;

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
        selectedPosition,
        selectedArgs,
        {
          isExpert: impactExpertise,
          affectsLivelihood: impactLivelihood,
          customText: allCustomText || undefined
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
    navigator.clipboard.writeText(generatedDraft);

    // If open for comment, show the modal to guide them to the submission page
    if (analysis?.openForComment) {
      setShowCopyModal(true);
    } else {
      // Fallback relative toast/alert if not open or flag missing
      alert("Comment copied to clipboard!");
    }
  };

  // ============================================================
  // RENDER: Loading State
  // ============================================================
  if (step === 'loading') {
    return (
      <>
        <Header title="Analyzing Docket..." subtitle="Please wait" onBack={() => window.history.back()} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="mb-6">
              <span className="material-symbols-outlined text-6xl text-primary animate-pulse">psychology</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Analyzing Regulation</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Our AI is reading the docket and preparing structured arguments for all positions...
            </p>
            <div className="mt-6 flex justify-center">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
                      className={`flex items-center justify-center gap-2 w-full font-bold py-3.5 px-4 rounded-xl transition-colors ${
                        hasEmailSubmission
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

          {/* Guidelines (always visible) */}
          <div className="px-4 pt-4 animate-slide-up">
            <SubmissionGuidelines
              docketId={docketId}
              agencyName={extractAgencyFromDocketId(docketId)}
              instructions={
                analysis?.commentingInstructions.requiredPoints?.join('. ') ||
                "Please refer to the official docket for submission instructions."
              }
            />
          </div>

          {/* ============================================================ */}
          {/* STEP 1: Summary & Stance Selection */}
          {/* ============================================================ */}
          {step === 'stance' && (
            <div className="px-4 pt-6 animate-slide-up">

              {/* AI-Generated Summary */}
              <div className="mb-8 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary">auto_awesome</span>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                    What This Regulation Does
                  </h3>
                </div>
                {analysis ? (
                  <div className="prose prose-sm text-gray-700 leading-relaxed">
                    <p>{analysis.summary}</p>

                    {/* Commenting Requirements */}
                    {analysis.commentingInstructions.requiredPoints && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                          Agency Requests Comments On:
                        </p>
                        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                          {analysis.commentingInstructions.requiredPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Link to original on Regulations.gov */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <a
                        href={`https://www.regulations.gov/${analysis?.objectType || 'document'}/${encodeURIComponent(docketId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                        View original on Regulations.gov
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  </div>
                )}
              </div>

              {/* Explore Perspectives - Help undecided users */}
              {analysis && (
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
              )}

              {/* Stance Selector */}
              <StanceSelector
                value={selectedPosition}
                onChange={handlePositionSelect}
              />

              {/* Position Summary Preview */}
              {selectedPosition && analysis && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-fade-in">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    <span className="font-medium text-gray-900">Why people {selectedPosition}:</span>{' '}
                    {analysis.positions[selectedPosition].summary}
                  </p>
                </div>
              )}

              {/* Continue Button */}
              <div className="mt-8">
                <button
                  onClick={handleContinueToReasoning}
                  disabled={!selectedPosition}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-white font-bold shadow-lg transition-all ${!selectedPosition
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-primary hover:bg-blue-600 shadow-blue-500/30"
                    }`}
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                  Choose My Arguments
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">
                  {analysis?.positions[selectedPosition || 'oppose'].reasonCards.length || 0} argument categories available
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
          {step === 'reasoning' && (
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
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${selectedPosition === 'support' ? 'bg-green-100 text-green-700' :
                  selectedPosition === 'oppose' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                  {selectedPosition}
                </span>
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
      {step === 'reasoning' && (
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
