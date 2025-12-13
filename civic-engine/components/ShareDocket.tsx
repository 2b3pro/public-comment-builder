import React, { useState } from 'react';

interface ShareDocketProps {
    docketId: string;
    docketTitle?: string;
    className?: string;
}

export const ShareDocket: React.FC<ShareDocketProps> = ({ docketId, docketTitle, className = '' }) => {
    const [copied, setCopied] = useState(false);
    const shareUrl = `https://public-comment-builder.vercel.app/docket/${docketId}`;
    const shareText = docketTitle
        ? `I'm writing a public comment on "${docketTitle}" using this tool. Make your voice heard too!`
        : `I'm writing a public comment on docket ${docketId} using this tool. Make your voice heard too!`;

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // We use window.open for email to avoid navigating away from the current page state if use uses webmail
    const handleEmail = (e: React.MouseEvent) => {
        e.preventDefault();
        const mailto = `mailto:?subject=${encodeURIComponent(`Action Required: Public Comment on ${docketId}`)}&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;
        window.location.href = mailto;
    };

    const handleX = () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
    };

    const handleLinkedIn = () => {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
    };

    return (
        <div className={`bg-indigo-50 border border-indigo-100 rounded-xl p-5 ${className}`}>
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                    <span className="material-symbols-outlined text-[20px] block">campaign</span>
                </div>
                <h4 className="text-sm font-bold text-indigo-900">
                    Amplify Your Impact
                </h4>
            </div>
            <p className="text-xs text-indigo-700 mb-4 leading-relaxed">
                Regulations change when meaningful numbers of people engage. Share this tool to help others write their own unique comments.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                    onClick={handleCopy}
                    className="col-span-2 bg-white border border-indigo-200 text-indigo-700 py-2.5 px-3 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                    <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'link'}</span>
                    {copied ? 'Link Copied' : 'Copy Direct Link'}
                </button>

                <button
                    onClick={handleEmail}
                    className="bg-white border border-indigo-200 text-indigo-700 py-2.5 px-3 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                    Email
                </button>

                <div className="flex gap-2">
                    <button
                        onClick={handleX}
                        className="flex-1 bg-white border border-indigo-200 text-indigo-700 py-2.5 px-3 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center shadow-sm"
                        title="Share on X (Twitter)"
                    >
                        <span className="">𝕏</span>
                    </button>
                    <button
                        onClick={handleLinkedIn}
                        className="flex-1 bg-white border border-indigo-200 text-indigo-700 py-2.5 px-3 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-all flex items-center justify-center shadow-sm"
                        title="Share on LinkedIn"
                    >
                        <span className="font-serif">in</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
