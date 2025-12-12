export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-base">gavel</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Public Comment Builder</span>
          </div>

          <div className="text-center md:text-left">
            <p className="text-xs text-gray-500 max-w-md">
              This tool helps citizens draft substantive public comments on federal regulations.
              Comments are submitted directly to agencies via email or as instructed on Regulations.gov.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-400">
            <a
              href="/faq"
              className="hover:text-primary transition-colors"
            >
              How It Works
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
        </div>
      </div>
    </footer>
  );
}
