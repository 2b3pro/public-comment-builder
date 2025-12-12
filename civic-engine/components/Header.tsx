import React from 'react';
import Link from 'next/link';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = "Proposed Rule",
  subtitle = "Public Commenting",
  onBack
}) => {
  return (
    <header className="flex items-center bg-white p-4 pb-2 justify-between shadow-sm z-10 shrink-0">
      <button
        onClick={onBack}
        className="text-gray-900 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined">arrow_back</span>
      </button>

      <div className="flex flex-col flex-1 px-2 text-center">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{subtitle}</span>
        <h2 className="text-gray-900 text-base font-bold leading-tight truncate">{title}</h2>
      </div>

      <Link
        href="/faq"
        className="text-primary flex size-12 shrink-0 items-center justify-center hover:bg-blue-50 rounded-full transition-colors"
        title="Help & FAQ"
      >
        <span className="material-symbols-outlined">help</span>
      </Link>
    </header>
  );
};
