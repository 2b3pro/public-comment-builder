'use client';

import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">gavel</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-gray-900 text-sm leading-tight">Public Comment</span>
            <span className="font-bold text-primary text-sm leading-tight">Builder</span>
          </div>
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/faq"
            className="text-sm text-gray-600 hover:text-primary transition-colors"
          >
            How It Works
          </Link>
          <a
            href="https://www.regulations.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-primary transition-colors flex items-center gap-1"
          >
            Regulations.gov
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
