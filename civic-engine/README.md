# Public Comment Builder

A web application that helps citizens draft legally substantive public comments on federal regulations. Instead of writing generic "I support/oppose this" comments that agencies can easily dismiss, this tool helps you craft specific, evidence-based arguments that agencies must meaningfully address.

## How It Works

1. **Browse Regulations** - View federal regulations with upcoming comment deadlines from Regulations.gov
2. **Select Your Position** - Choose whether you support, oppose, or have mixed feelings about the proposal
3. **Build Your Argument** - Select from AI-generated reason cards aligned with federal evaluation criteria (cost-benefit analysis, distributional impacts, implementation concerns, etc.)
4. **Add Your Perspective** - Include your lived experience and personal context to strengthen your comment
5. **Generate & Submit** - Get a professionally formatted comment ready for submission to the agency

## Why This Matters

Federal agencies are legally required to respond to significant, substantive public comments under the Administrative Procedure Act. However, most public comments are easily dismissed because they:
- Simply state support or opposition without explanation
- Don't reference specific provisions in the regulation
- Lack concrete evidence or examples
- Don't suggest actionable alternatives

This tool helps you write comments that matter.

## Getting Started

### Prerequisites

- Node.js 18+
- Redis (optional, for caching)

### Installation

```bash
cd civic-engine
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Regulations.gov API (optional - falls back to DEMO_KEY)
REGULATIONSGOV_API_KEY=your_api_key

# Google Gemini API (optional - falls back to mock data)
GEMINI_API_KEY=your_api_key

# Redis URL (optional - falls back to in-memory/no caching)
REDIS_URL=redis://localhost:6379
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

## Architecture

### Two-Call AI Architecture

The app uses a streamlined two-call AI pattern:

1. **First Call (Analyze Docket)** - When you open a docket, the AI analyzes the full regulatory text and generates:
   - Plain-language summary
   - Commenting instructions (deadlines, format)
   - Reason cards for all three positions (support, oppose, mixed)

2. **Second Call (Generate Comment)** - After you select arguments, the AI drafts a formal comment incorporating:
   - Your selected reason cards
   - Personal context and expertise
   - Custom text you've added
   - Proper formatting for regulatory proceedings

### Key Technologies

- **Next.js 16** - App Router with Server Actions
- **Google Gemini** - AI analysis and comment generation
- **Redis** - Caching for docket content (7 days) and searches (24 hours)
- **Regulations.gov API** - Federal regulatory data
- **Tailwind CSS v4** - Styling
- **Material Symbols** - Icons

### Project Structure

```
civic-engine/
├── app/
│   ├── page.tsx           # Dashboard - browse regulations
│   ├── docket/[id]/       # Comment builder wizard
│   └── actions.ts         # Server actions (API calls, AI)
├── components/
│   ├── SiteHeader.tsx     # Global header
│   ├── SiteFooter.tsx     # Global footer
│   ├── ReasoningCard.tsx  # Argument selection cards
│   └── StanceSelector.tsx # Position picker
├── lib/
│   ├── ai-generator.ts    # Gemini integration
│   ├── regulations-api.ts # Regulations.gov client
│   └── redis.ts           # Caching utilities
└── prompts/
    ├── analyzeDocket.txt       # First AI call prompt
    ├── regenerateReasonCard.txt # Refresh arguments
    └── generateFinalComment.txt # Second AI call prompt
```

## Caching Strategy

- **Dashboard dockets**: Cached daily (24h TTL) since new regulations are posted infrequently
- **Individual docket content**: Cached for 7 days since regulatory text doesn't change
- **Search results**: Cached daily per query
- **AI analysis**: Not cached (regenerated each visit for freshness)

Redis is optional - the app works without it but API calls won't be cached across requests.

## Contributing

Contributions welcome! Areas of interest:
- Additional argument frameworks beyond PRA factors
- PDF export of generated comments
- Comment tracking and submission status
- Mobile app version

## License

MIT

## Acknowledgments

- [Regulations.gov](https://www.regulations.gov) for the open API
- Federal guidance on effective public commenting from OMB and various agencies
