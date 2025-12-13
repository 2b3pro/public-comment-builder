import React from 'react';
import { ShareDocket } from '@/components/ShareDocket';

interface CommentPreviewProps {
  draft: string;
  onEdit: (newText: string) => void;
  onBack: () => void;
  onCopy: () => void;
  submissionEmail?: string; // Email address for comment submission
  docketId?: string; // For email subject line
}

export const CommentPreview: React.FC<CommentPreviewProps> = ({
  draft,
  onEdit,
  onBack,
  onCopy,
  submissionEmail,
  docketId
}) => {
  // Generate mailto link with pre-populated fields
  const generateMailtoLink = () => {
    if (!submissionEmail) return null;

    const subject = encodeURIComponent(`Public Comment: ${docketId || 'Federal Regulation'}`);
    const body = encodeURIComponent(draft);

    return `mailto:${submissionEmail}?subject=${subject}&body=${body}`;
  };

  const mailtoLink = generateMailtoLink();

  return (
    <div className="flex flex-col h-full animate-slide-up">
      <div className="px-4 py-4">
        <h2 className="text-gray-900 text-2xl font-bold mb-2">Review Your Comment</h2>
        <p className="text-gray-500 text-sm mb-4">
          Review and edit your comment before submitting.
          {submissionEmail ? ` You can send directly to ${submissionEmail}` : ' Copy to clipboard and submit via the appropriate channel.'}
        </p>

        <div className="relative">
          <textarea
            className="w-full h-[55vh] p-4 text-base text-gray-800 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none font-serif leading-relaxed"
            value={draft}
            onChange={(e) => onEdit(e.target.value)}
          />
          <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
            {draft.length} chars
          </div>
        </div>
      </div>

      <div className="mt-auto bg-white border-t border-gray-200 p-4 pb-8 flex flex-col gap-3 shadow-lg z-20">
        {/* Primary action: Email if available, otherwise Copy */}
        {mailtoLink ? (
          <a
            href={mailtoLink}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined">mail</span>
            Send via Email
          </a>
        ) : (
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-white font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined">content_copy</span>
            Copy to Clipboard
          </button>
        )}

        {/* Secondary action: Copy if email is primary */}
        {mailtoLink && (
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-gray-700 font-bold hover:bg-gray-200 transition-all"
          >
            <span className="material-symbols-outlined">content_copy</span>
            Copy to Clipboard
          </button>
        )}

        <button
          onClick={onBack}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-gray-700 font-bold hover:bg-gray-200 transition-all"
        >
          <span className="material-symbols-outlined">edit</span>
          Back to Edit Options
        </button>

        {!mailtoLink && (
          <a
            href="https://www.regulations.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs text-primary hover:underline mt-2"
          >
            Open Regulations.gov in new tab
          </a>
        )}

        {/* Share Widget */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <ShareDocket docketId={docketId || ''} className="bg-indigo-50/50" />
        </div>
      </div>
    </div>
  );
};
