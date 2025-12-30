# Changelog

All notable changes to Public Comment Builder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2025-12-30

### Added
- **Citizen's Brief**: On-demand plain-language explainer for regulatory notices
  - Collapsible panel on docket page between summary and stance selection
  - AI-generated briefing with: plain-English summary, context & stakes, multi-perspective impact table, response guidance, and one-sentence verdict
  - Optional glossary for technical documents
  - 7-day Redis caching to avoid duplicate AI calls
  - Request deduplication prevents multiple in-flight generations

## [1.3.0] - 2025-12-30

### Added
- Public changelog page at `/changelog` for transparency about site updates
- Changelog link in site footer
- Docket cards now display abstract/description when available from the API

### Changed
- Search results now filter to only show dockets with open comment periods (commentEndDate >= today)
- Footer links now wrap gracefully on mobile devices

## [1.2.0] - 2025-12-29

### Added
- PCB logo on landing page and SEO/OG images
- Facebook and Threads share buttons on comment review page
- Page link included in share text for easier sharing

## [1.1.1] - 2025-12-12

### Added
- Comment submission flow enhancement with direct Regulations.gov link
- `openForComment` detection using dual-signal approach (API flag + AI deadline inference)
- Modal dialog after copying comment that guides users to submit on Regulations.gov
- Live status check on every docket load (not relying solely on cache)

### Changed
- Updated `DocketSummary` and `DocketAnalysis` interfaces to include `openForComment` field
- AI prompt now receives current date context to infer comment period status

## [1.1.0] - 2025-12-10

### Added
- FAQ page explaining how substantive comments work
- "Recently Commented" section showing trending dockets by comment count
- Background cache warming for faster docket analysis
- Admin stats page at `/admin/stats`

### Changed
- Dashboard now shows dockets in 3, 7, and 15 day buckets (aligned with Regulations.gov)

## [1.0.0] - 2025-12-01

### Added
- Initial public release
- Dashboard showing dockets with open comment periods
- AI-powered comment drafting with Gemini Flash
- Three-step wizard: stance selection, argument cards, review/export
- Integration with Regulations.gov API for live docket data
- Federal Register API fallback for full document text
- Redis caching layer with graceful fallback
- SQLite persistent cache for docket analysis
- Copy-to-clipboard functionality
- Anonymous statistics tracking (comment counts per docket)
