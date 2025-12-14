import React, { useState, useMemo } from 'react';
import { ShareDocket } from '@/components/ShareDocket';

interface CommentPreviewProps {
  draft: string;
  onEdit: (newText: string) => void;
  onBack: () => void;
  onCopy: () => void;
  submissionEmail?: string; // Email address for comment submission, or "NONE" if not available
  onlineSubmission?: boolean; // Whether online submission via regulations.gov is available
  submissionMethodsDescription?: string; // Human-readable description of all submission methods
  docketId?: string; // For email subject line and regulations.gov link
}

/**
 * Extract and separate the <summary> block from the comment text.
 * Returns { cleanComment, summary } where summary is null if not found.
 */
function parseSummaryFromComment(text: string): { cleanComment: string; summary: string | null } {
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    const cleanComment = text.replace(/<summary>[\s\S]*?<\/summary>/, '').trim();
    return { cleanComment, summary };
  }
  return { cleanComment: text, summary: null };
}

export const CommentPreview: React.FC<CommentPreviewProps> = ({
  draft,
  onEdit,
  onBack,
  onCopy,
  submissionEmail,
  onlineSubmission = true, // Default to true since most federal dockets accept online submission
  submissionMethodsDescription,
  docketId
}) => {
  const [summaryCopied, setSummaryCopied] = useState(false);

  // Parse out the summary block from the draft
  const { cleanComment, summary } = useMemo(() => parseSummaryFromComment(draft), [draft]);

  // Check if email submission is actually available (not "NONE")
  const hasEmailSubmission = submissionEmail && submissionEmail !== 'NONE';

  // Copy summary to clipboard (includes page link)
  const handleCopySummary = async () => {
    if (!summary) return;
    const pageUrl = `https://public-comment-builder.vercel.app/docket/${docketId}`;
    const shareText = `${summary} ${pageUrl}`;
    try {
      await navigator.clipboard.writeText(shareText);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  };

  // Generate mailto link with pre-populated fields (uses clean comment without summary)
  const generateMailtoLink = () => {
    if (!hasEmailSubmission) return null;

    const subject = encodeURIComponent(`Public Comment: ${docketId || 'Federal Regulation'}`);
    const body = encodeURIComponent(cleanComment);

    return `mailto:${submissionEmail}?subject=${subject}&body=${body}`;
  };

  const mailtoLink = generateMailtoLink();

  // Generate regulations.gov comment URL
  const regulationsGovUrl = docketId
    ? `https://www.regulations.gov/commenton/${encodeURIComponent(docketId)}`
    : 'https://www.regulations.gov';

  return (
    <div className="flex flex-col h-full animate-slide-up">
      <div className="px-4 py-4">
        <h2 className="text-gray-900 text-2xl font-bold mb-2">Review Your Comment</h2>
        <p className="text-gray-500 text-sm mb-4">
          Review and edit your comment before submitting.
        </p>

        {/* Submission Methods Info Box */}
        {submissionMethodsDescription && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5">info</span>
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">How to Submit</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {submissionMethodsDescription}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="relative">
          <textarea
            className="w-full h-[50vh] p-4 text-base text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none font-serif leading-relaxed"
            value={cleanComment}
            onChange={(e) => {
              // Preserve the summary when user edits the comment
              const newComment = summary
                ? `${e.target.value}\n\n<summary>${summary}</summary>`
                : e.target.value;
              onEdit(newComment);
            }}
          />
          <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
            {cleanComment.length} chars
          </div>
        </div>
      </div>

      <div className="mt-auto bg-white border-t border-gray-200 p-4 pb-8 flex flex-col gap-3 shadow-lg z-20">
        {/* Primary submission options based on what's available */}
        {hasEmailSubmission && (
          <a
            href={mailtoLink!}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined">mail</span>
            Send via Email
          </a>
        )}

        {onlineSubmission && (
          <a
            href={regulationsGovUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 font-bold transition-all active:scale-[0.98] ${
              hasEmailSubmission
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-primary text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600'
            }`}
          >
            <span className="material-symbols-outlined">open_in_new</span>
            Submit on Regulations.gov
          </a>
        )}

        {/* Copy to clipboard - always available (copies clean comment without summary) */}
        <button
          onClick={onCopy}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-gray-700 font-bold hover:bg-gray-200 transition-all"
        >
          <span className="material-symbols-outlined">content_copy</span>
          Copy to Clipboard
        </button>

        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-gray-700 font-bold hover:bg-gray-200 transition-all"
        >
          <span className="material-symbols-outlined">edit</span>
          Back to Edit Options
        </button>

        {/* Amplify Your Impact - Social Sharing Section */}
        {summary && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-indigo-600">campaign</span>
                <h3 className="font-bold text-gray-900">Amplify Your Impact</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Share that you submitted a comment to encourage others to participate:
              </p>
              <div
                onClick={handleCopySummary}
                className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
              >
                <p className="leading-relaxed">{summary}</p>
                <div className="flex items-center gap-1 mt-2 text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  {summaryCopied ? 'Copied!' : 'Click to copy'}
                </div>
              </div>
              {/* Social share buttons */}
              {(() => {
                const pageUrl = `https://public-comment-builder.vercel.app/docket/${docketId}`;
                const shareText = `${summary} ${pageUrl}`;
                return (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X
                    </a>
                    <a
                      href={`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-xs font-medium rounded-lg hover:bg-sky-600 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 568 501"><path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.659 0 75.291 0 57.946 0-28.906 76.135-1.612 123.121 33.664Z"/></svg>
                      Bluesky
                    </a>
                    <a
                      href={`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 192 192"><path d="M141.537 88.988a66.169 66.169 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.326c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.077c8.249.052 14.474 2.45 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.521 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C34.612 152.967 29.184 133.682 28.98 109c.203-24.683 5.632-43.966 16.121-57.317 11.216-14.258 28.467-21.573 51.275-21.742 22.99.172 40.538 7.515 52.082 21.841 5.608 6.961 9.82 15.551 12.553 25.512l17.182-4.31c-3.495-12.43-9.155-23.073-16.817-31.631C147.222 25.22 125.394 16.625 96.626 16c-28.752.624-50.382 9.208-64.398 25.544C18.406 57.372 10.986 80.008 10.98 109l.001.018c.007 28.992 7.426 51.628 21.648 67.288 14.015 16.337 35.645 24.92 64.397 25.544 28.761-.624 50.591-9.376 64.997-26.32 16.321-18.115 15.864-41.037 7.86-57.802-5.961-12.851-16.009-22.361-28.346-29.74ZM99.18 143.507c-8.764.438-17.471-3.203-18.01-13.482-.422-7.83 5.774-16.858 18.35-17.631 1.377-.077 2.731-.117 4.062-.117 6.528 0 12.578.76 17.991 2.225-1.746 22.947-10.828 28.451-21.814 29.005h-.579Z"/></svg>
                      Threads
                    </a>
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(summary)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </a>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                      LinkedIn
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Fallback share widget if no summary */}
        {!summary && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <ShareDocket docketId={docketId || ''} className="bg-indigo-50/50" />
          </div>
        )}
      </div>
    </div>
  );
};
