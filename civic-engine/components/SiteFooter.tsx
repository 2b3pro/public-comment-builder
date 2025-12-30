export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Row 1: Logo + Description */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-base">gavel</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Public Comment Builder</span>
          </div>
          <p className="text-xs text-gray-500 max-w-md">
            Helping citizens participate in federal rulemaking. You submit your comment directly
            through official channels. An independent civic project—not government affiliated.
          </p>
        </div>

        {/* Row 2: Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <a
            href="/faq"
            className="hover:text-primary transition-colors"
          >
            How It Works
          </a>
          <span className="text-gray-300">|</span>
          <a
            href="/changelog"
            className="hover:text-primary transition-colors"
          >
            Changelog
          </a>
          <span className="text-gray-300">|</span>
          <a
            href="https://www.regulations.gov/commenting-guidance"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Commenting Guide
          </a>
          <span className="text-gray-300">|</span>
          <a
            href="https://www.regulations.gov/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Regulations.gov FAQ
          </a>
          <span className="text-gray-300">|</span>
          <span>&copy; {currentYear}</span>
        </div>

        {/* Row 3: Made with love */}
        <div className="text-center">
          <p className="text-xs text-gray-400">
            Made with ❤️ for 🇺🇸{' '}
            <span className="mx-1">·</span>
            <a
              href="https://paypal.me/2b3/5"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              ☕ Buy me a coffee
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
