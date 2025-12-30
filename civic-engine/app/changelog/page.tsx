import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Changelog - Public Comment Builder",
  description: "See what's new and what's changed in Public Comment Builder. We believe in transparency about how this civic tool evolves.",
};

interface ChangelogEntry {
  date: string;
  version?: string;
  title: string;
  changes: {
    type: 'added' | 'changed' | 'fixed' | 'removed';
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    date: '2025-12-30',
    version: '1.5.0',
    title: 'Brief-First Flow',
    changes: [
      {
        type: 'changed',
        description: "Citizen's Brief now loads first, giving users a plain-language summary to read while arguments generate in background",
      },
      {
        type: 'added',
        description: 'Brief-informed argument generation: AI uses the brief\'s stakeholder impacts and suggested angles to produce more targeted arguments',
      },
      {
        type: 'added',
        description: 'New loading states and progress indicators show brief loading and argument generation stages separately',
      },
      {
        type: 'changed',
        description: 'Brief content displayed prominently on docket page (no longer collapsible) for better reading experience',
      },
    ],
  },
  {
    date: '2025-12-30',
    version: '1.4.0',
    title: "Citizen's Brief",
    changes: [
      {
        type: 'added',
        description: "Citizen's Brief: On-demand plain-language explainer for regulatory notices",
      },
      {
        type: 'added',
        description: 'AI-generated briefing includes: plain-English summary, context & stakes, multi-perspective impact table, response guidance, and one-sentence verdict',
      },
      {
        type: 'added',
        description: 'Optional glossary for technical documents with jargon definitions',
      },
      {
        type: 'added',
        description: '7-day Redis caching and request deduplication to optimize AI costs',
      },
    ],
  },
  {
    date: '2025-12-30',
    version: '1.3.0',
    title: 'Search Improvements & UI Enhancements',
    changes: [
      {
        type: 'changed',
        description: 'Search results now only show dockets with open comment periods (not yet expired)',
      },
      {
        type: 'added',
        description: 'Docket cards now display a brief description/abstract when available from the API',
      },
      {
        type: 'added',
        description: 'This changelog page for transparency about site updates',
      },
    ],
  },
  {
    date: '2025-12-29',
    version: '1.2.0',
    title: 'Branding & Social Sharing',
    changes: [
      {
        type: 'added',
        description: 'PCB logo added to landing page and SEO/OG images',
      },
      {
        type: 'added',
        description: 'Facebook and Threads share buttons on comment review page',
      },
      {
        type: 'changed',
        description: 'Share functionality now includes page link for easier sharing',
      },
    ],
  },
  {
    date: '2025-12-01',
    version: '1.0.0',
    title: 'Initial Public Release',
    changes: [
      {
        type: 'added',
        description: 'Dashboard showing dockets closing in 3, 7, and 15 days',
      },
      {
        type: 'added',
        description: 'AI-powered comment drafting with stance selection and argument cards',
      },
      {
        type: 'added',
        description: 'Integration with Regulations.gov API for live docket data',
      },
      {
        type: 'added',
        description: 'Copy-to-clipboard and direct link to submit on Regulations.gov',
      },
      {
        type: 'added',
        description: 'FAQ page explaining how substantive comments work',
      },
    ],
  },
];

const typeStyles = {
  added: 'bg-green-100 text-green-700',
  changed: 'bg-blue-100 text-blue-700',
  fixed: 'bg-yellow-100 text-yellow-700',
  removed: 'bg-red-100 text-red-700',
};

const typeLabels = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-primary text-sm font-medium hover:underline mb-4 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Changelog
          </h1>
          <p className="text-gray-600">
            What&apos;s new and what&apos;s changed. We believe in transparency about how this civic tool evolves.
          </p>
        </div>

        {/* Changelog Entries */}
        <div className="space-y-6">
          {changelog.map((entry, idx) => (
            <article
              key={idx}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary">update</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-900">{entry.title}</h2>
                    {entry.version && (
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        v{entry.version}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-gray-500">{formatDate(entry.date)}</time>
                </div>
              </div>

              <ul className="space-y-2 pl-8">
                {entry.changes.map((change, changeIdx) => (
                  <li key={changeIdx} className="flex items-start gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeStyles[change.type]}`}>
                      {typeLabels[change.type]}
                    </span>
                    <span className="text-sm text-gray-600">{change.description}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>
            Have a suggestion or found a bug?{' '}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Let us know
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
