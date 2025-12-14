# Changelog

## 1.20 - 2025-12-12

### Added - Comment Submission Flow Enhancement

#### Feature: Open for Comment Detection & Direct Submission Link

**Problem Solved:**
Users needed a way to determine if a document is accepting comments and a streamlined path to submit their drafted comments on Regulations.gov.

**Implementation:**

1. **API Integration (`lib/regulations-api.ts`)**
   - Added `openForComment?: boolean` field to `DocketSummary` interface
   - Mapped the `openForComment` attribute from Regulations.gov API responses in:
     - `getDocumentsClosingRange()`
     - `searchDocuments()`
     - `getDocumentDetails()`
     - `getDocumentFullDetails()`

2. **AI Analysis Enhancement (`lib/ai-generator.ts`)**
   - Updated `DocketAnalysis` interface to include `openForComment?: boolean`
   - Modified AI prompt (`prompts/analyzeDocket.txt`) to:
     - Receive current date as context
     - Infer comment period status from deadline text
     - Return `openForComment` based on deadline vs. current date comparison
   - Updated response schema to capture AI-inferred open status

3. **Server Actions (`app/actions.ts`)**
   - Enhanced `analyzeDocketContent()` to:
     - Fetch live `openForComment` status from API
     - Combine API signal with AI-inferred signal using OR logic
     - Ensures detection even when API flag is missing but text has valid deadline
     - Updates cached analysis with fresh status on each request

4. **UI Enhancement (`app/docket/[id]/page.tsx`)**
   - Added modal dialog that appears after copying comment text
   - Modal displays when `analysis.openForComment === true`
   - Provides direct link to `https://www.regulations.gov/commenton/{docketId}`
   - Guides users to paste their comment on the official submission page
   - Fallback alert for documents not open for comment

**User Flow:**
1. User drafts comment and clicks "Copy to Clipboard"
2. If document is open for comment → Modal appears with success message
3. User clicks "Go to Submission Page" → Opens Regulations.gov in new tab
4. User pastes their pre-copied comment and submits

**Technical Details:**
- Dual-signal approach: API flag OR AI deadline inference
- Prevents false negatives when API doesn't provide flag
- Fresh status check on every docket load (not cached)
- Modal uses Material Symbols icons and matches app design system

**Files Modified:**
- `lib/regulations-api.ts` - API response mapping
- `lib/ai-generator.ts` - Type definitions and AI schema
- `prompts/analyzeDocket.txt` - AI prompt enhancement
- `app/actions.ts` - Status detection logic
- `app/docket/[id]/page.tsx` - Copy modal UI

---

## Previous Changes

(Add previous changelog entries here)
