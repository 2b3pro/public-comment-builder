import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.GEMINI_API_KEY;

// ============================================================
// PROMPT LOADING & TEMPLATING
// ============================================================

const PROMPTS_DIR = join(process.cwd(), "prompts");
const FRAMEWORKS_DIR = join(PROMPTS_DIR, "frameworks");

/**
 * Load all response framework files and concatenate them.
 * Used for the {{responseFrameworks}} variable in analyzeDocket prompt.
 */
async function loadResponseFrameworks(): Promise<string> {
  const frameworkFiles = [
    "proposed-rule.txt",
    "pra-notice.txt",
    "rfi.txt",
    "general.txt"
  ];

  const frameworks: string[] = [];
  for (const file of frameworkFiles) {
    try {
      const content = await readFile(join(FRAMEWORKS_DIR, file), "utf-8");
      frameworks.push(content.trim());
    } catch (err) {
      console.error(`[ai-generator] Failed to load framework ${file}:`, err);
    }
  }

  return frameworks.join("\n\n──────────────────────────────────────────────────────────────────\n\n");
}

/**
 * Load a prompt template from the prompts/ directory.
 * Templates use {{variableName}} syntax for substitution.
 * Special handling for {{responseFrameworks}} which loads from frameworks/ subdirectory.
 */
async function loadPrompt(name: string, variables: Record<string, string> = {}): Promise<string> {
  const filePath = join(PROMPTS_DIR, `${name}.txt`);
  try {
    let template = await readFile(filePath, "utf-8");

    // Handle special {{responseFrameworks}} variable
    if (template.includes("{{responseFrameworks}}")) {
      const frameworks = await loadResponseFrameworks();
      template = template.replace(/\{\{responseFrameworks\}\}/g, frameworks);
    }

    // Substitute variables: {{variableName}} -> value
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    console.log(`[ai-generator] Loaded prompt: ${name} (${template.length} chars)`);
    return template;
  } catch (err) {
    console.error(`[ai-generator] Failed to load prompt ${name}:`, err);
    throw new Error(`Prompt file not found: ${filePath}`);
  }
}

// ============================================================
// LOGGING
// ============================================================

const LOG_DIR = join(process.cwd(), "logs");

async function logAICall(name: string, prompt: string, response: string) {
  // Only log to file in development
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    await mkdir(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}_${name}.json`;
    await writeFile(
      join(LOG_DIR, filename),
      JSON.stringify({ timestamp: new Date().toISOString(), name, prompt, response }, null, 2)
    );
    console.log(`[ai-generator] Logged to logs/${filename}`);
  } catch (err) {
    console.error("[ai-generator] Failed to write log:", err);
  }
}

// ============================================================
// RESPONSE SCHEMAS FOR STRUCTURED OUTPUT
// ============================================================

// Reusable schema for reason cards (used across all notice types)
const reasonCardSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    id: { type: SchemaType.STRING },
    topic: { type: SchemaType.STRING },
    icon: { type: SchemaType.STRING },
    arguments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          expansion: { type: SchemaType.STRING }
        },
        required: ["id", "label", "expansion"]
      }
    }
  },
  required: ["id", "topic", "icon", "arguments"]
};

// Position analysis schema (for proposed_rule notice type)
const positionAnalysisSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    position: { type: SchemaType.STRING },
    summary: { type: SchemaType.STRING },
    reasonCards: {
      type: SchemaType.ARRAY,
      items: reasonCardSchema
    }
  },
  required: ["position", "summary", "reasonCards"]
};

// RFI Question schema (for rfi notice type)
const rfiQuestionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questionNumber: { type: SchemaType.NUMBER, description: "The question number from the original document" },
    questionText: { type: SchemaType.STRING, description: "The agency's question, paraphrased if very long" },
    responseCards: {
      type: SchemaType.ARRAY,
      items: reasonCardSchema
    }
  },
  required: ["questionNumber", "questionText", "responseCards"]
};

const docketAnalysisSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    noticeType: {
      type: SchemaType.STRING,
      description: "Type of federal notice: 'proposed_rule', 'pra_notice', 'rfi', or 'general'"
    },
    summary: { type: SchemaType.STRING, description: "Plain-language 2-3 sentence summary" },
    openForComment: { type: SchemaType.BOOLEAN, description: "True if comment period is open based on text deadlines and current date" },
    commentingInstructions: {
      type: SchemaType.OBJECT,
      properties: {
        format: { type: SchemaType.STRING },
        requiredPoints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        deadline: { type: SchemaType.STRING, description: "Human-readable deadline description (e.g., '60 days from publication' or 'February 9, 2026')" },
        deadlineDate: { type: SchemaType.STRING, description: "ISO 8601 date of the comment deadline in YYYY-MM-DD format (e.g., '2025-02-09'). Calculate from relative deadlines using CURRENT DATE. Set to empty string if no deadline can be determined." },
        responsePeriodDays: { type: SchemaType.NUMBER, description: "Number of days in the comment period (e.g., 30, 60, 90). Extract from text like '60-day notice'. Set to 0 if unknown." },
        submissionMethod: { type: SchemaType.STRING },
        submissionEmail: { type: SchemaType.STRING, description: "Email address for submitting comments if mentioned in the docket, or 'NONE' if email submission is not available" },
        onlineSubmission: { type: SchemaType.BOOLEAN, description: "True if the agency accepts online submission via regulations.gov or similar portal" },
        submissionMethodsDescription: { type: SchemaType.STRING, description: "Plain-language description of ALL submission methods the agency accepts (e.g., 'Submit online at regulations.gov, by email to comments@agency.gov, or by mail to...')" }
      },
      required: ["submissionEmail", "onlineSubmission", "submissionMethodsDescription", "deadlineDate", "responsePeriodDays"]
    },
    // For proposed_rule notice type: traditional positions
    positions: {
      type: SchemaType.OBJECT,
      nullable: true,
      description: "Only populated for proposed_rule notice type",
      properties: {
        support: positionAnalysisSchema,
        oppose: positionAnalysisSchema,
        mixed: positionAnalysisSchema
      },
      required: ["support", "oppose", "mixed"]
    },
    // For pra_notice type: PRA factors
    praFactors: {
      type: SchemaType.OBJECT,
      nullable: true,
      description: "Only populated for pra_notice notice type - the four PRA factors",
      properties: {
        necessity: {
          type: SchemaType.OBJECT,
          description: "Whether the collection is necessary for agency functions",
          properties: {
            summary: { type: SchemaType.STRING },
            reasonCards: { type: SchemaType.ARRAY, items: reasonCardSchema }
          },
          required: ["summary", "reasonCards"]
        },
        burdenAccuracy: {
          type: SchemaType.OBJECT,
          description: "Accuracy of burden estimates (time, cost)",
          properties: {
            summary: { type: SchemaType.STRING },
            reasonCards: { type: SchemaType.ARRAY, items: reasonCardSchema }
          },
          required: ["summary", "reasonCards"]
        },
        quality: {
          type: SchemaType.OBJECT,
          description: "Enhancing quality, utility, and clarity of information",
          properties: {
            summary: { type: SchemaType.STRING },
            reasonCards: { type: SchemaType.ARRAY, items: reasonCardSchema }
          },
          required: ["summary", "reasonCards"]
        },
        burdenMinimization: {
          type: SchemaType.OBJECT,
          description: "Minimizing burden on respondents",
          properties: {
            summary: { type: SchemaType.STRING },
            reasonCards: { type: SchemaType.ARRAY, items: reasonCardSchema }
          },
          required: ["summary", "reasonCards"]
        }
      },
      required: ["necessity", "burdenAccuracy", "quality", "burdenMinimization"]
    },
    // For rfi notice type: questions with response cards
    rfiQuestions: {
      type: SchemaType.ARRAY,
      nullable: true,
      description: "Only populated for rfi notice type - agency questions with response options",
      items: rfiQuestionSchema
    },
    // For general notice type: issue-based cards
    issueCards: {
      type: SchemaType.ARRAY,
      nullable: true,
      description: "Only populated for general notice type - issue-based response cards",
      items: reasonCardSchema
    }
  },
  required: ["noticeType", "summary", "commentingInstructions"]
};

// ============================================================
// TYPES
// ============================================================

export type Position = 'support' | 'oppose' | 'mixed';
export type NoticeType = 'proposed_rule' | 'pra_notice' | 'rfi' | 'general';
export type PRAFactor = 'necessity' | 'burdenAccuracy' | 'quality' | 'burdenMinimization';

export interface ArgumentOption {
  id: string;
  label: string;
  expansion: string;
}

export interface ReasonCard {
  id: string;
  topic: string;
  icon: string;
  arguments: ArgumentOption[];
}

export interface PositionAnalysis {
  position: Position;
  summary: string; // Why someone might hold this position
  reasonCards: ReasonCard[];
}

export interface PRAFactorAnalysis {
  summary: string;
  reasonCards: ReasonCard[];
}

export interface PRAFactors {
  necessity: PRAFactorAnalysis;
  burdenAccuracy: PRAFactorAnalysis;
  quality: PRAFactorAnalysis;
  burdenMinimization: PRAFactorAnalysis;
}

export interface RFIQuestion {
  questionNumber: number;
  questionText: string;
  responseCards: ReasonCard[];
}

export interface CommentingInstructions {
  format?: string;
  requiredPoints?: string[];
  deadline?: string; // Human-readable deadline description
  deadlineDate?: string; // ISO 8601 date (YYYY-MM-DD) of comment deadline
  responsePeriodDays?: number; // Number of days in the comment period (e.g., 60)
  submissionMethod?: string;
  submissionEmail?: string; // Email address for comment submission, or "NONE" if not available
  onlineSubmission?: boolean; // True if agency accepts online submission via regulations.gov
  submissionMethodsDescription?: string; // Human-readable description of all accepted submission methods
}

export interface DocketAnalysis {
  noticeType: NoticeType; // Type of federal notice determines response framework
  summary: string; // Plain-language summary of what the docket is about
  commentingInstructions: CommentingInstructions;

  // For proposed_rule notice type: traditional positions
  positions?: {
    support: PositionAnalysis;
    oppose: PositionAnalysis;
    mixed: PositionAnalysis;
  };

  // For pra_notice type: PRA factors
  praFactors?: PRAFactors;

  // For rfi type: question-based responses
  rfiQuestions?: RFIQuestion[];

  // For general type: issue-based cards
  issueCards?: ReasonCard[];

  // Metadata (added by system, not AI)
  openForComment?: boolean; // Live status from Regulations.gov
  commentEndDate?: string; // ISO timestamp of comment deadline from API (e.g., "2025-12-16T04:59:59Z")
  objectType?: 'document' | 'docket'; // Type for correct Regulations.gov URL
  analyzedAt?: string; // ISO timestamp of when the analysis was performed/cached
}

// Legacy type alias for backward compatibility
export interface ArgumentCategory {
  id: string;
  title: string;
  icon: string;
  options: ArgumentOption[];
}

// ============================================================
// MOCK DATA - Used when GEMINI_API_KEY is not set
// ============================================================

const MOCK_DOCKET_ANALYSIS: DocketAnalysis = {
  noticeType: 'pra_notice', // Mock data represents a PRA notice

  summary: "CBP proposes significant changes to the ESTA and I-94 systems, including mandatory selfie photos, decommissioning the ESTA website in favor of mobile-only applications, requiring 5 years of social media history, and collecting extensive personal data about applicants and their families. The agency also plans a voluntary self-reported exit pilot program using the CBP Home app.",

  commentingInstructions: {
    format: "Written comments should address one or more of the four PRA factors",
    requiredPoints: [
      "Whether the proposed collection is necessary for proper agency performance",
      "Accuracy of burden estimates and methodology",
      "Suggestions to enhance quality, utility, and clarity",
      "Suggestions to minimize burden on respondents"
    ],
    deadline: "60 days from publication",
    submissionMethod: "Electronic submission via regulations.gov",
    submissionEmail: "NONE",
    onlineSubmission: true,
    submissionMethodsDescription: "Comments may be submitted online at regulations.gov or by mail to U.S. Customs and Border Protection, Office of Trade, Regulations and Rulings, Attn: Trade and Border Security Division, 90 K Street NE, 10th Floor, Washington, DC 20229-1177."
  },

  // PRA factors for pra_notice type
  praFactors: {
    necessity: {
      summary: "Questions whether the proposed information collection is necessary for the agency to perform its functions.",
      reasonCards: [
        {
          id: 'pra-nec-1',
          topic: 'Data Collection Exceeds Purpose',
          icon: 'lightbulb',
          arguments: [
            {
              id: 'pra-nec-1-1',
              label: 'Data collection is excessive for stated purpose',
              expansion: 'The collection of DNA, 10 years of email history, and extensive family member data far exceeds what is necessary for determining travel authorization eligibility, violating the principle of data minimization under the PRA.'
            },
            {
              id: 'pra-nec-1-2',
              label: 'No evidence linking family data to security outcomes',
              expansion: 'The agency has failed to demonstrate how collecting family members\' phone numbers, dates of birth, and residency information has practical utility for security screening that outweighs the privacy intrusion.'
            },
            {
              id: 'pra-nec-1-3',
              label: 'IP metadata collection lacks clear security nexus',
              expansion: 'The proposal to collect IP addresses and metadata from submitted photos has no demonstrated connection to determining whether an individual poses a security risk.'
            }
          ]
        },
        {
          id: 'pra-nec-2',
          topic: 'Legitimate Security Functions',
          icon: 'shield',
          arguments: [
            {
              id: 'pra-nec-2-1',
              label: 'Biometric verification prevents identity fraud',
              expansion: 'The proposed facial recognition and liveness detection features will significantly reduce the ability of bad actors to submit fraudulent applications using stolen or fabricated identities.'
            },
            {
              id: 'pra-nec-2-2',
              label: 'NFC chip validation ensures passport authenticity',
              expansion: 'Requiring mobile-based e-Chip validation addresses the documented vulnerability where facilitators have created hundreds of fraudulent ESTAs using uploaded fraudulent passport bio pages.'
            }
          ]
        }
      ]
    },
    burdenAccuracy: {
      summary: "Evaluates whether the agency's burden estimates are accurate and whether the methodology is sound.",
      reasonCards: [
        {
          id: 'pra-bur-1',
          topic: 'Time Estimates Understated',
          icon: 'timer',
          arguments: [
            {
              id: 'pra-bur-1-1',
              label: '22-minute estimate is grossly understated',
              expansion: 'The estimate of 22 minutes per ESTA Mobile application is factually incorrect; compiling 5 years of social media accounts, 10 years of email addresses, and detailed information about multiple family members will likely require hours.'
            },
            {
              id: 'pra-bur-1-2',
              label: 'Burden methodology ignores record retrieval time',
              expansion: 'The agency\'s burden calculation fails to account for the significant time required to retrieve historical phone numbers, email addresses, and contact information spanning 5-10 years.'
            }
          ]
        },
        {
          id: 'pra-bur-2',
          topic: 'Hidden Costs Not Calculated',
          icon: 'calculate',
          arguments: [
            {
              id: 'pra-bur-2-1',
              label: 'Technology requirements impose additional costs',
              expansion: 'The mobile-only mandate requiring NFC chip verification fails to account for costs imposed on travelers who must purchase NFC-capable smartphones to comply with ESTA requirements.'
            },
            {
              id: 'pra-bur-2-2',
              label: 'Third-party assistance costs not included',
              expansion: 'Many travelers will need to pay for third-party assistance to navigate the complex application requirements, adding costs not captured in burden estimates.'
            }
          ]
        }
      ]
    },
    quality: {
      summary: "Suggests ways to enhance the quality, utility, and clarity of the information to be collected.",
      reasonCards: [
        {
          id: 'pra-qual-1',
          topic: 'Data Quality Concerns',
          icon: 'fact_check',
          arguments: [
            {
              id: 'pra-qual-1-1',
              label: 'Historical data accuracy cannot be verified',
              expansion: 'Requiring 10 years of email addresses and 5 years of phone numbers may result in inaccurate data, as applicants cannot reliably recall or verify information from that far back.'
            },
            {
              id: 'pra-qual-1-2',
              label: 'Social media information may be incomplete or misleading',
              expansion: 'Social media account disclosure does not account for deleted accounts, pseudonymous use, or platforms no longer in existence, potentially yielding incomplete security assessments.'
            }
          ]
        },
        {
          id: 'pra-qual-2',
          topic: 'Form Clarity Issues',
          icon: 'edit_document',
          arguments: [
            {
              id: 'pra-qual-2-1',
              label: 'Ambiguous definitions may confuse applicants',
              expansion: 'Terms like "social media accounts" and "family members" require clearer definitions to ensure consistent and accurate responses across applicants.'
            },
            {
              id: 'pra-qual-2-2',
              label: 'Instructions need plain-language revision',
              expansion: 'Application instructions should be revised using plain language principles to ensure non-native English speakers can accurately complete the required fields.'
            }
          ]
        }
      ]
    },
    burdenMinimization: {
      summary: "Recommends ways to minimize the burden of the collection on respondents, including use of technology.",
      reasonCards: [
        {
          id: 'pra-min-1',
          topic: 'Preserve Access Alternatives',
          icon: 'smartphone',
          arguments: [
            {
              id: 'pra-min-1-1',
              label: 'Mobile-only requirement excludes vulnerable populations',
              expansion: 'Decommissioning the ESTA website creates an unreasonable barrier for elderly travelers, those with disabilities affecting smartphone use, and travelers from regions with limited smartphone penetration.'
            },
            {
              id: 'pra-min-1-2',
              label: 'Website alternative achieves security with less exclusion',
              expansion: 'Rather than eliminating the website entirely, the agency could implement improved photo quality checks and additional verification steps while preserving access for those unable to use mobile applications.'
            }
          ]
        },
        {
          id: 'pra-min-2',
          topic: 'Reduce Data Collection Scope',
          icon: 'filter_list',
          arguments: [
            {
              id: 'pra-min-2-1',
              label: 'Limit family data to immediate household members',
              expansion: 'If family information has legitimate security value, the collection should be limited to immediate household members rather than extending to all parents, siblings, and children regardless of residence.'
            },
            {
              id: 'pra-min-2-2',
              label: 'Reduce email/phone lookback to 2 years',
              expansion: 'The 10-year lookback for email addresses and 5-year lookback for phone numbers is excessive; a 2-year window would capture relevant current information while reducing burden.'
            },
            {
              id: 'pra-min-2-3',
              label: 'DNA collection should require specific justification',
              expansion: 'DNA collection is appropriate only where specific security concerns exist, not as a blanket requirement for all ESTA applicants.'
            }
          ]
        },
        {
          id: 'pra-min-3',
          topic: 'Implementation Safeguards',
          icon: 'policy',
          arguments: [
            {
              id: 'pra-min-3-1',
              label: 'Provide phase-in period for mobile transition',
              expansion: 'Rather than immediate website decommissioning, implement a 2-year transition period allowing travelers to adapt and ensuring mobile application reliability.'
            },
            {
              id: 'pra-min-3-2',
              label: 'Require clear data retention and deletion policies',
              expansion: 'The agency should establish and publish specific retention periods and deletion procedures for the expanded data collection, particularly for biometric data.'
            }
          ]
        }
      ]
    }
  }
};

// ============================================================
// CORE AI FUNCTIONS
// ============================================================

/**
 * Primary analysis function - ONE call to understand the docket and generate
 * summary, commenting instructions, and rationale options for all positions.
 */
export async function analyzeDocket(docketText: string): Promise<DocketAnalysis> {
  console.log(`[ai-generator] analyzeDocket: textLength=${docketText.length}`);

  if (!API_KEY) {
    console.log("[ai-generator] GEMINI_API_KEY not found, using mock data");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
    return MOCK_DOCKET_ANALYSIS;
  }

  console.log("[ai-generator] Calling Gemini API for docket analysis with structured output...");
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: docketAnalysisSchema
    }
  });

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = await loadPrompt("analyzeDocket", { docketText, currentDate });

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    console.log(`[ai-generator] Gemini structured response received (${text.length} chars)`);

    // Log the AI call
    await logAICall("analyzeDocket", prompt, text);

    const parsed = JSON.parse(text) as DocketAnalysis;
    console.log(`[ai-generator] Successfully parsed docket analysis`);
    return parsed;
  } catch (error) {
    console.error("[ai-generator] Error analyzing docket:", error);
    console.log("[ai-generator] Falling back to mock data");
    return MOCK_DOCKET_ANALYSIS;
  }
}

/**
 * Regenerate arguments for a specific reason card.
 * Used when user wants fresh arguments for a particular topic.
 * Supports both position-based (proposed_rule) and factor-based (pra_notice) structures.
 */
export async function regenerateReasonCard(
  docketText: string,
  positionOrFactor: Position | PRAFactor,
  cardTopic: string,
  existingArguments: string[], // Labels of arguments to avoid repeating
  noticeType: NoticeType = 'proposed_rule'
): Promise<ReasonCard> {
  console.log(`[ai-generator] regenerateReasonCard: type=${noticeType}, positionOrFactor=${positionOrFactor}, topic=${cardTopic}`);

  if (!API_KEY) {
    console.log("[ai-generator] GEMINI_API_KEY not found, returning mock regeneration");
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get mock cards based on notice type
    let mockCards: ReasonCard[] = [];
    if (noticeType === 'pra_notice' && MOCK_DOCKET_ANALYSIS.praFactors) {
      const factor = positionOrFactor as PRAFactor;
      mockCards = MOCK_DOCKET_ANALYSIS.praFactors[factor]?.reasonCards || [];
    } else if (MOCK_DOCKET_ANALYSIS.positions) {
      const position = positionOrFactor as Position;
      mockCards = MOCK_DOCKET_ANALYSIS.positions[position]?.reasonCards || [];
    }

    const existingCard = mockCards.find(c => c.topic === cardTopic);
    if (existingCard) {
      return {
        ...existingCard,
        id: `${existingCard.id}-regen-${Date.now()}`,
        arguments: existingCard.arguments.map(arg => ({
          ...arg,
          id: `${arg.id}-regen-${Date.now()}`,
          label: `[Regenerated] ${arg.label}`
        }))
      };
    }
    return mockCards[0] || {
      id: `fallback-${Date.now()}`,
      topic: cardTopic,
      icon: 'help_outline',
      arguments: []
    };
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = await loadPrompt("regenerateReasonCard", {
    docketText,
    position: positionOrFactor,
    cardTopic,
    existingArguments: existingArguments.join('\n'),
    noticeType
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("[ai-generator] Error regenerating reason card:", error);
    // Fallback to empty card
    return {
      id: `error-${Date.now()}`,
      topic: cardTopic,
      icon: 'warning',
      arguments: []
    };
  }
}

/**
 * Second AI call - Generate the final formatted comment based on user selections.
 * Supports different notice types with appropriate framing.
 */
export async function generateFinalComment(
  docketText: string,
  commentingInstructions: CommentingInstructions,
  selectedArguments: ArgumentOption[],
  personalContext: {
    isExpert: boolean;
    affectsLivelihood: boolean;
    customText?: string;
  },
  options: {
    noticeType?: NoticeType;
    position?: Position; // Only for proposed_rule
    praFactor?: PRAFactor; // Only for pra_notice (which factors were addressed)
  } = {}
): Promise<string> {
  const { noticeType = 'proposed_rule', position } = options;
  console.log(`[ai-generator] generateFinalComment: noticeType=${noticeType}, position=${position}, args=${selectedArguments.length}`);

  if (!API_KEY) {
    console.log("[ai-generator] GEMINI_API_KEY not found, using template-based generation");
    await new Promise(resolve => setTimeout(resolve, 1500));
    return buildTemplateComment(selectedArguments, personalContext, { noticeType, position });
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = await loadPrompt("generateFinalComment", {
    docketText: docketText.slice(0, 2000),
    format: commentingInstructions.format || 'Address the relevant factors',
    requiredPoints: commentingInstructions.requiredPoints?.join('; ') || 'Standard evaluation criteria',
    noticeType,
    position: position || 'N/A',
    selectedArguments: selectedArguments.map((a, i) => `${i + 1}. ${a.label}: ${a.expansion}`).join('\n\n'),
    isExpert: String(personalContext.isExpert),
    affectsLivelihood: String(personalContext.affectsLivelihood),
    customContext: personalContext.customText ? `- Additional context from commenter: ${personalContext.customText}` : ''
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log(`[ai-generator] Generated final comment (${text.length} chars)`);
    return text;
  } catch (error) {
    console.error("[ai-generator] Error generating final comment:", error);
    return buildTemplateComment(selectedArguments, personalContext, { noticeType, position });
  }
}

/**
 * Fallback template-based comment builder (no AI)
 * Supports different notice types with appropriate framing.
 */
function buildTemplateComment(
  selectedArguments: ArgumentOption[],
  personalContext: {
    isExpert: boolean;
    affectsLivelihood: boolean;
    customText?: string;
  },
  options: {
    noticeType?: NoticeType;
    position?: Position;
  } = {}
): string {
  const { noticeType = 'proposed_rule', position } = options;
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let comment = `${date}

To Whom It May Concern:

`;

  // Opening based on notice type
  if (noticeType === 'pra_notice') {
    comment += `I am writing to submit comments on this proposed information collection request pursuant to the Paperwork Reduction Act of 1995. My comments address the following PRA factors.\n\n`;
  } else if (noticeType === 'rfi') {
    comment += `I am writing to respond to this Request for Information. My comments address the questions posed by the agency.\n\n`;
  } else if (noticeType === 'general') {
    comment += `I am writing to submit my comments on this federal notice.\n\n`;
  } else {
    // proposed_rule - use position-based framing
    comment += `I am writing to submit my public comment on this proposed rulemaking. `;
    if (position === 'support') {
      comment += `I write in support of the proposed rule, with specific observations on its implementation.\n\n`;
    } else if (position === 'oppose') {
      comment += `I respectfully oppose the proposed rule as currently written for the following reasons.\n\n`;
    } else {
      comment += `While I appreciate the agency's objectives, I have both supportive observations and significant concerns that warrant consideration.\n\n`;
    }
  }

  if (personalContext.isExpert || personalContext.affectsLivelihood) {
    comment += `STATEMENT OF INTEREST\n\n`;
    if (personalContext.isExpert) {
      comment += `I am a subject matter expert with direct knowledge of the issues addressed by this proposal. `;
    }
    if (personalContext.affectsLivelihood) {
      comment += `This matter will directly impact my professional livelihood and operations. `;
    }
    comment += `\n\n`;
  }

  // Section header based on notice type
  if (noticeType === 'pra_notice') {
    comment += `COMMENTS ON PRA FACTORS\n\n`;
  } else if (noticeType === 'rfi') {
    comment += `RESPONSES TO AGENCY QUESTIONS\n\n`;
  } else {
    comment += `SUBSTANTIVE COMMENTS\n\n`;
  }

  selectedArguments.forEach((arg, index) => {
    comment += `${index + 1}. ${arg.label}\n\n${arg.expansion}\n\n`;
  });

  if (personalContext.customText) {
    comment += `ADDITIONAL COMMENTS\n\n${personalContext.customText}\n\n`;
  }

  comment += `CONCLUSION\n\nFor the foregoing reasons, I urge the agency to carefully consider these comments in its deliberations. Thank you for the opportunity to participate in this process.

Respectfully submitted,

[Your Name]
[Your Address]
[Your Email]`;

  // Add social sharing summary
  const topicDescription = noticeType === 'pra_notice'
    ? 'a federal information collection request'
    : noticeType === 'rfi'
    ? 'a federal request for information'
    : 'a proposed federal regulation';

  comment += `\n\n<summary>I submitted a public comment on ${topicDescription}. I raised ${selectedArguments.length} substantive points for the agency to consider. Draft your comments at public-comment-builder.vercel.app</summary>`;

  return comment;
}

// ============================================================
// LEGACY FUNCTION - For backward compatibility
// ============================================================

export async function generateArgumentsWithAI(
  docketText: string,
  stance: string
): Promise<ArgumentCategory[]> {
  console.log(`[ai-generator] LEGACY generateArgumentsWithAI called - redirecting to analyzeDocket`);

  const analysis = await analyzeDocket(docketText);

  // Handle different notice types
  let reasonCards: ReasonCard[] = [];

  if (analysis.noticeType === 'pra_notice' && analysis.praFactors) {
    // For PRA notices, combine all factor cards
    reasonCards = [
      ...analysis.praFactors.necessity.reasonCards,
      ...analysis.praFactors.burdenAccuracy.reasonCards,
      ...analysis.praFactors.quality.reasonCards,
      ...analysis.praFactors.burdenMinimization.reasonCards
    ];
  } else if (analysis.noticeType === 'rfi' && analysis.rfiQuestions) {
    // For RFI, combine all question response cards
    reasonCards = analysis.rfiQuestions.flatMap(q => q.responseCards);
  } else if (analysis.noticeType === 'general' && analysis.issueCards) {
    reasonCards = analysis.issueCards;
  } else if (analysis.positions) {
    // For proposed_rule, use position-based cards
    const positionKey = stance as Position;
    const positionData = analysis.positions[positionKey] || analysis.positions.oppose;
    reasonCards = positionData.reasonCards;
  }

  // Convert to legacy format
  return reasonCards.map(card => ({
    id: card.id,
    title: card.topic,
    icon: card.icon,
    options: card.arguments
  }));
}
