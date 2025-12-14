/**
 * Test script to verify notice type detection on real federal notices.
 *
 * Fetches recent documents from Regulations.gov and runs AI analysis
 * to check if notice types are properly detected.
 *
 * Run with: npx tsx scripts/test-notice-types.ts
 */

import { regulationsApi, buildDocketTextForAnalysis, fetchFederalRegisterContent } from '../lib/regulations-api';
import { analyzeDocket, NoticeType } from '../lib/ai-generator';

interface TestResult {
  docketId: string;
  title: string;
  subtype: string;
  detectedType: NoticeType;
  hasPraKeywords: boolean;
  hasRfiKeywords: boolean;
  summary: string;
  reasonCardsCount: number;
  success: boolean;
  error?: string;
}

// Keywords that suggest PRA notices
const PRA_KEYWORDS = [
  'paperwork reduction act',
  'pra',
  'information collection',
  'omb control number',
  'burden estimate',
  'burden hours',
  'information collection request'
];

// Keywords that suggest RFI/ANPRM
const RFI_KEYWORDS = [
  'request for information',
  'rfi',
  'advance notice',
  'anprm',
  'seeking comment on',
  'questions for comment'
];

function detectKeywords(text: string): { hasPra: boolean; hasRfi: boolean } {
  const lowerText = text.toLowerCase();
  return {
    hasPra: PRA_KEYWORDS.some(kw => lowerText.includes(kw)),
    hasRfi: RFI_KEYWORDS.some(kw => lowerText.includes(kw))
  };
}

function getReasonCardsCount(analysis: Awaited<ReturnType<typeof analyzeDocket>>): number {
  if (analysis.noticeType === 'proposed_rule' && analysis.positions) {
    return (
      analysis.positions.support.reasonCards.length +
      analysis.positions.oppose.reasonCards.length +
      analysis.positions.mixed.reasonCards.length
    );
  }
  if (analysis.noticeType === 'pra_notice' && analysis.praFactors) {
    return (
      analysis.praFactors.necessity.reasonCards.length +
      analysis.praFactors.burdenAccuracy.reasonCards.length +
      analysis.praFactors.quality.reasonCards.length +
      analysis.praFactors.burdenMinimization.reasonCards.length
    );
  }
  if (analysis.noticeType === 'rfi' && analysis.rfiQuestions) {
    return analysis.rfiQuestions.reduce((sum, q) => sum + q.responseCards.length, 0);
  }
  if (analysis.noticeType === 'general' && analysis.issueCards) {
    return analysis.issueCards.length;
  }
  return 0;
}

async function fetchDocketText(doc: { documentId?: string; docketId: string }): Promise<string> {
  try {
    // Try to get detailed document info
    if (doc.documentId) {
      const details = await regulationsApi.getDocumentDetails(doc.documentId);
      let text = buildDocketTextForAnalysis(details);

      // If content is sparse, try Federal Register
      if (text.length < 500 && details.frDocNum) {
        console.log(`  [FR Fallback] Fetching from Federal Register...`);
        const frContent = await fetchFederalRegisterContent(details.frDocNum);
        if (frContent) {
          text = `${text}\n\n--- Federal Register Content ---\n${frContent}`;
        }
      }
      return text;
    }
    return `Docket: ${doc.docketId}`;
  } catch (err) {
    console.error(`  Error fetching docket text:`, err);
    return `Docket: ${doc.docketId}`;
  }
}

async function testNoticeTypeDetection() {
  console.log('='.repeat(80));
  console.log('NOTICE TYPE DETECTION TEST');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`API Key configured: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No (will use mock data)'}`);
  console.log('');

  // Fetch recent documents with open comment periods
  console.log('Fetching recent documents from Regulations.gov...\n');

  let documents;
  try {
    documents = await regulationsApi.getDocumentsClosingRange(14); // Next 2 weeks
    console.log(`Found ${documents.length} documents with upcoming deadlines.\n`);
  } catch (err) {
    console.error('Failed to fetch documents:', err);
    return;
  }

  // Take up to 10 documents
  const testDocs = documents.slice(0, 10);
  const results: TestResult[] = [];

  for (let i = 0; i < testDocs.length; i++) {
    const doc = testDocs[i];
    console.log('-'.repeat(80));
    console.log(`[${i + 1}/${testDocs.length}] ${doc.docketId}`);
    console.log(`Title: ${doc.title?.slice(0, 100)}${(doc.title?.length || 0) > 100 ? '...' : ''}`);
    console.log(`Subtype: ${doc.subtype || 'N/A'}`);
    console.log(`Comment Deadline: ${doc.commentEndDate}`);

    try {
      // Fetch full document text
      console.log('  Fetching document text...');
      const docketText = await fetchDocketText({
        documentId: doc.id,
        docketId: doc.docketId
      });
      console.log(`  Document text length: ${docketText.length} chars`);

      // Check for keywords
      const keywords = detectKeywords(docketText);
      console.log(`  PRA keywords found: ${keywords.hasPra}`);
      console.log(`  RFI keywords found: ${keywords.hasRfi}`);

      // Run AI analysis
      console.log('  Running AI analysis...');
      const startTime = Date.now();
      const analysis = await analyzeDocket(docketText);
      const elapsed = Date.now() - startTime;
      console.log(`  Analysis completed in ${elapsed}ms`);

      // Report results
      const cardsCount = getReasonCardsCount(analysis);
      console.log(`  \x1b[32mDetected Type: ${analysis.noticeType}\x1b[0m`);
      console.log(`  Summary: ${analysis.summary.slice(0, 150)}...`);
      console.log(`  Reason Cards Generated: ${cardsCount}`);

      // Validate detection
      let success = true;
      if (keywords.hasPra && analysis.noticeType !== 'pra_notice') {
        console.log(`  \x1b[33m⚠ Warning: PRA keywords found but detected as ${analysis.noticeType}\x1b[0m`);
        success = false;
      }
      if (keywords.hasRfi && !keywords.hasPra && analysis.noticeType !== 'rfi') {
        console.log(`  \x1b[33m⚠ Warning: RFI keywords found but detected as ${analysis.noticeType}\x1b[0m`);
        success = false;
      }

      results.push({
        docketId: doc.docketId,
        title: doc.title || '',
        subtype: doc.subtype || '',
        detectedType: analysis.noticeType,
        hasPraKeywords: keywords.hasPra,
        hasRfiKeywords: keywords.hasRfi,
        summary: analysis.summary,
        reasonCardsCount: cardsCount,
        success
      });

    } catch (err) {
      console.error(`  \x1b[31mError analyzing document:\x1b[0m`, err);
      results.push({
        docketId: doc.docketId,
        title: doc.title || '',
        subtype: doc.subtype || '',
        detectedType: 'general',
        hasPraKeywords: false,
        hasRfiKeywords: false,
        summary: '',
        reasonCardsCount: 0,
        success: false,
        error: String(err)
      });
    }

    // Small delay to avoid rate limiting
    if (i < testDocs.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const byType: Record<string, number> = {};
  let successCount = 0;

  for (const r of results) {
    byType[r.detectedType] = (byType[r.detectedType] || 0) + 1;
    if (r.success) successCount++;
  }

  console.log(`\nDocuments Analyzed: ${results.length}`);
  console.log(`Successful Detections: ${successCount}/${results.length}`);
  console.log(`\nDetected Types:`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  - ${type}: ${count}`);
  }

  console.log(`\nDetailed Results:`);
  console.log('-'.repeat(80));
  for (const r of results) {
    const status = r.success ? '\x1b[32m✓\x1b[0m' : '\x1b[33m⚠\x1b[0m';
    console.log(`${status} ${r.docketId}`);
    console.log(`   Type: ${r.detectedType} | Cards: ${r.reasonCardsCount} | PRA: ${r.hasPraKeywords} | RFI: ${r.hasRfiKeywords}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

// Run the test
testNoticeTypeDetection().catch(console.error);
