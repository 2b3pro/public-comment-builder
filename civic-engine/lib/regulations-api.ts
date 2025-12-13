import axios, { isAxiosError } from 'axios';

const API_KEY = process.env.REGULATIONSGOV_API_KEY || 'DEMO_KEY';
const BASE_URL = 'https://api.regulations.gov/v4';

export interface DocketSummary {
  id: string;
  title: string;
  agencyId: string;
  docketId: string;
  postedDate: string;
  commentEndDate?: string;
  subtype?: string;
  abstract?: string;
  submissionInstructions?: string; // Parsed or raw instructions
  openForComment?: boolean; // explicit flag from API
}

export interface DocumentFullDetails extends DocketSummary {
  content?: string; // Full HTML/text content from Federal Register
  fileFormats?: { fileUrl: string; format: string }[];
  frDocNum?: string; // Federal Register document number
}

export const regulationsApi = {
  /**
   * Get documents with comment period closing within the next N days
   * @param daysRange Number of days to look ahead (e.g., 7)
   */
  async getDocumentsClosingRange(daysRange: number): Promise<DocketSummary[]> {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + daysRange);

    const startDateStr = today.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    console.log(`[regulations-api] getDocumentsClosingRange: ${startDateStr} to ${endDateStr}`);

    try {
      const response = await axios.get(`${BASE_URL}/documents`, {
        params: {
          'filter[commentEndDate][ge]': startDateStr,
          'filter[commentEndDate][le]': endDateStr,
          'api_key': API_KEY,
          'sort': 'commentEndDate', // Sort by due date ascending
          'page[size]': 25, // Limit to 25 items to save bandwidth/processing
        },
      });

      const results = response.data.data.map((doc: any) => ({
        id: doc.id,
        title: doc.attributes.title,
        agencyId: doc.attributes.agencyId,
        docketId: doc.attributes.docketId,
        postedDate: doc.attributes.postedDate,
        commentEndDate: doc.attributes.commentEndDate,
        subtype: doc.attributes.subtype,
        abstract: doc.attributes.abstract,
        openForComment: doc.attributes.openForComment,
      }));
      console.log(`[regulations-api] getDocumentsClosingRange: found ${results.length} documents`);
      return results;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 429) {
        console.warn(`[regulations-api] getDocumentsClosingRange: rate limited`);
        return [];
      }
      console.error(`[regulations-api] getDocumentsClosingRange: error`, error);
      return [];
    }
  },

  /**
   * Search for documents (e.g., by Docket ID or keyword)
   */
  async searchDocuments(query: string, sort: string = '-postedDate'): Promise<DocketSummary[]> {
    console.log(`[regulations-api] searchDocuments: query="${query}" sort="${sort}"`);
    try {
      const response = await axios.get(`${BASE_URL}/documents`, {
        params: {
          'filter[searchTerm]': query,
          'api_key': API_KEY,
          'sort': sort,
        },
      });

      // Transform response to our interface
      const results = response.data.data.map((doc: any) => ({
        id: doc.id,
        title: doc.attributes.title,
        agencyId: doc.attributes.agencyId,
        docketId: doc.attributes.docketId,
        postedDate: doc.attributes.postedDate,
        commentEndDate: doc.attributes.commentEndDate,
        subtype: doc.attributes.subtype,
        abstract: doc.attributes.abstract,
        openForComment: doc.attributes.openForComment,
      }));
      console.log(`[regulations-api] searchDocuments: found ${results.length} results`);
      return results;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 429) {
        console.warn(`[regulations-api] searchDocuments: rate limited`);
        return [];
      }
      console.error(`[regulations-api] searchDocuments: error`, error);
      return [];
    }
  },

  /**
   * Get detailed information for a specific document
   */
  async getDocumentDetails(documentId: string): Promise<DocketSummary | null> {
    console.log(`[regulations-api] getDocumentDetails: fetching ${documentId}`);
    try {
      const response = await axios.get(`${BASE_URL}/documents/${documentId}`, {
        params: {
          'api_key': API_KEY,
          'include': 'attachments', // Attachments often contain the full text/PDF with instructions
        },
      });
      console.log(`[regulations-api] getDocumentDetails: success for ${documentId}`);

      const attr = response.data.data.attributes;

      // Attempt to find submission instructions in the content or abstract
      // In a real implementation, we might parse the HTML content if available
      const instructions = extractSubmissionInstructions(attr.content || attr.abstract);

      return {
        id: response.data.data.id,
        title: attr.title,
        agencyId: attr.agencyId,
        docketId: attr.docketId,
        postedDate: attr.postedDate,
        commentEndDate: attr.commentEndDate,
        subtype: attr.subtype,
        abstract: attr.abstract,
        submissionInstructions: instructions,
        openForComment: attr.openForComment,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 429) {
          console.warn(`[regulations-api] getDocumentDetails: rate limited for ${documentId}`);
          return null;
        }
        if (error.response?.status === 404) {
          console.log(`[regulations-api] getDocumentDetails: 404 for ${documentId} (may be a docket ID)`);
          return null;
        }
      }
      console.error(`[regulations-api] getDocumentDetails: error for ${documentId}:`, error);
      return null;
    }
  },

  /**
   * Get full document details including content for AI analysis.
   * This fetches all available text content from the document.
   */
  async getDocumentFullDetails(documentId: string): Promise<DocumentFullDetails | null> {
    console.log(`[regulations-api] getDocumentFullDetails: fetching ${documentId}`);
    try {
      const response = await axios.get(`${BASE_URL}/documents/${documentId}`, {
        params: {
          'api_key': API_KEY,
          'include': 'attachments',
        },
      });
      console.log(`[regulations-api] getDocumentFullDetails: success for ${documentId}`);

      const attr = response.data.data.attributes;
      const instructions = extractSubmissionInstructions(attr.content || attr.abstract);

      // Extract file formats if available
      const fileFormats = attr.fileFormats?.map((f: any) => ({
        fileUrl: f.fileUrl,
        format: f.format,
      })) || [];

      return {
        id: response.data.data.id,
        title: attr.title,
        agencyId: attr.agencyId,
        docketId: attr.docketId,
        postedDate: attr.postedDate,
        commentEndDate: attr.commentEndDate,
        subtype: attr.subtype,
        abstract: attr.abstract,
        content: attr.content, // Full content (may be HTML)
        fileFormats,
        frDocNum: attr.frDocNum,
        submissionInstructions: instructions,
        openForComment: attr.openForComment,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        console.log(`[regulations-api] getDocumentFullDetails: error ${status} for ${documentId}`);
        if (status === 404 || status === 429) {
          return null;
        }
      }
      console.error(`[regulations-api] getDocumentFullDetails: error for ${documentId}:`, error);
      return null;
    }
  },

  /**
   * Get detailed information for a specific docket
   */
  async getDocketDetails(docketId: string): Promise<DocketSummary | null> {
    console.log(`[regulations-api] getDocketDetails: fetching ${docketId}`);
    try {
      const response = await axios.get(`${BASE_URL}/dockets/${docketId}`, {
        params: { 'api_key': API_KEY },
      });
      console.log(`[regulations-api] getDocketDetails: success for ${docketId}`);
      const attr = response.data.data.attributes;
      return {
        id: response.data.data.id,
        title: attr.title,
        agencyId: attr.agencyId,
        docketId: idOrDocketId(response.data.data.id),
        postedDate: attr.lastModifiedDate,
        subtype: attr.docketType,
        abstract: attr.docketAbstract,
        submissionInstructions: undefined,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        console.log(`[regulations-api] getDocketDetails: error ${status} for ${docketId}`);
        if (status === 404 || status === 400 || status === 429) {
          return null;
        }
      }
      console.error(`[regulations-api] getDocketDetails: unexpected error for ${docketId}:`, error);
      return null;
    }
  }
};

function idOrDocketId(val: string) { return val; }

/**
 * Strip HTML tags and decode entities for plain text extraction.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
}

/**
 * Build a comprehensive text representation of a document for AI analysis.
 * Combines title, abstract, and full content into a structured format.
 */
export function buildDocketTextForAnalysis(doc: DocumentFullDetails): string {
  const parts: string[] = [];

  parts.push(`DOCUMENT ID: ${doc.id}`);
  parts.push(`TITLE: ${doc.title}`);
  parts.push(`AGENCY: ${doc.agencyId}`);

  if (doc.commentEndDate) {
    parts.push(`COMMENT DEADLINE: ${doc.commentEndDate}`);
  }

  if (doc.frDocNum) {
    parts.push(`FEDERAL REGISTER DOCUMENT: ${doc.frDocNum}`);
  }

  parts.push(''); // Empty line separator

  if (doc.abstract) {
    parts.push('ABSTRACT:');
    parts.push(doc.abstract);
    parts.push('');
  }

  if (doc.content) {
    parts.push('FULL TEXT:');
    parts.push(stripHtml(doc.content));
  }

  if (doc.submissionInstructions) {
    parts.push('');
    parts.push('SUBMISSION INSTRUCTIONS:');
    parts.push(doc.submissionInstructions);
  }

  return parts.join('\n');
}

/**
 * Helper to extract potential submission instructions from text.
 * This is a heuristic and would need refinement based on real data structure.
 */
function extractSubmissionInstructions(text?: string): string | undefined {
  if (!text) return undefined;

  // Look for common headers
  const patterns = [
    /ADDRESSES:[\s\S]*?(?=FOR FURTHER INFORMATION CONTACT:)/i,
    /SUBMISSION OF COMMENTS:[\s\S]*?(?=\n\n)/i,
    /How to submit comments:[\s\S]*?(?=\n\n)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}