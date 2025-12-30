'use client';

import React, { useState } from 'react';
import { clsx } from 'clsx';
import { generateCitizenBriefAction } from '@/app/actions';
import type { CitizenBrief as CitizenBriefType } from '@/lib/ai-generator';

interface CitizenBriefProps {
  docketId: string;
  className?: string;
}

export const CitizenBrief: React.FC<CitizenBriefProps> = ({ docketId, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [brief, setBrief] = useState<CitizenBriefType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    // If closing, just toggle
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // If opening and already have data, just show it
    if (brief) {
      setIsOpen(true);
      return;
    }

    // Otherwise, fetch the brief
    setIsOpen(true);
    setIsLoading(true);
    setError(null);

    try {
      const result = await generateCitizenBriefAction(docketId);
      setBrief(result);
    } catch (err) {
      console.error('[CitizenBrief] Error fetching brief:', err);
      setError('Failed to generate brief. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={clsx(
      "bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl overflow-hidden",
      className
    )}>
      {/* Header - Always Visible */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-indigo-100/50 transition-colors"
        onClick={handleToggle}
      >
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
        <span className={clsx(
          "material-symbols-outlined text-indigo-400 transition-transform",
          isOpen ? "rotate-180" : ""
        )}>
          expand_more
        </span>
      </div>

      {/* Content - Expandable */}
      {isOpen && (
        <div className="p-4 pt-0 animate-fade-in">
          {/* Loading State */}
          {isLoading && (
            <div className="py-8 text-center">
              <div className="inline-flex items-center gap-2 text-indigo-600">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span className="text-sm font-medium">Generating your brief...</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Our AI is reading the full regulatory text
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="py-4 px-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                  setIsLoading(true);
                  generateCitizenBriefAction(docketId)
                    .then(setBrief)
                    .catch(() => setError('Failed to generate brief. Please try again.'))
                    .finally(() => setIsLoading(false));
                }}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Brief Content */}
          {brief && !isLoading && (
            <div className="space-y-5">
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

              {/* Footer */}
              <p className="text-xs text-gray-400 pt-2 border-t border-indigo-100">
                Generated {new Date(brief.generatedAt).toLocaleDateString()} at{' '}
                {new Date(brief.generatedAt).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
