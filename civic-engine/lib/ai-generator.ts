import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.GEMINI_API_KEY;

// ============================================================
// PROMPT LOADING & TEMPLATING
// ============================================================

const PROMPTS_DIR = join(process.cwd(), "prompts");

/**
 * Load a prompt template from the prompts/ directory.
 * Templates use {{variableName}} syntax for substitution.
 */
async function loadPrompt(name: string, variables: Record<string, string> = {}): Promise<string> {
  const filePath = join(PROMPTS_DIR, `${name}.txt`);
  try {
    let template = await readFile(filePath, "utf-8");

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

const docketAnalysisSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING, description: "Plain-language 2-3 sentence summary" },
    openForComment: { type: SchemaType.BOOLEAN, description: "True if comment period is open based on text deadlines and current date" },
    commentingInstructions: {
      type: SchemaType.OBJECT,
      properties: {
        format: { type: SchemaType.STRING },
        requiredPoints: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        deadline: { type: SchemaType.STRING },
        submissionMethod: { type: SchemaType.STRING },
        submissionEmail: { type: SchemaType.STRING, description: "Email address for submitting comments if mentioned in the docket, or 'NONE' if email submission is not available" },
        onlineSubmission: { type: SchemaType.BOOLEAN, description: "True if the agency accepts online submission via regulations.gov or similar portal" },
        submissionMethodsDescription: { type: SchemaType.STRING, description: "Plain-language description of ALL submission methods the agency accepts (e.g., 'Submit online at regulations.gov, by email to comments@agency.gov, or by mail to...')" }
      },
      required: ["submissionEmail", "onlineSubmission", "submissionMethodsDescription"]
    },
    positions: {
      type: SchemaType.OBJECT,
      properties: {
        support: {
          type: SchemaType.OBJECT,
          properties: {
            position: { type: SchemaType.STRING },
            summary: { type: SchemaType.STRING },
            reasonCards: {
              type: SchemaType.ARRAY,
              items: {
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
              }
            }
          },
          required: ["position", "summary", "reasonCards"]
        },
        oppose: {
          type: SchemaType.OBJECT,
          properties: {
            position: { type: SchemaType.STRING },
            summary: { type: SchemaType.STRING },
            reasonCards: {
              type: SchemaType.ARRAY,
              items: {
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
              }
            }
          },
          required: ["position", "summary", "reasonCards"]
        },
        mixed: {
          type: SchemaType.OBJECT,
          properties: {
            position: { type: SchemaType.STRING },
            summary: { type: SchemaType.STRING },
            reasonCards: {
              type: SchemaType.ARRAY,
              items: {
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
              }
            }
          },
          required: ["position", "summary", "reasonCards"]
        }
      },
      required: ["support", "oppose", "mixed"]
    }
  },
  required: ["summary", "commentingInstructions", "positions"]
};

// ============================================================
// TYPES
// ============================================================

export type Position = 'support' | 'oppose' | 'mixed';

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

export interface CommentingInstructions {
  format?: string;
  requiredPoints?: string[];
  deadline?: string;
  submissionMethod?: string;
  submissionEmail?: string; // Email address for comment submission, or "NONE" if not available
  onlineSubmission?: boolean; // True if agency accepts online submission via regulations.gov
  submissionMethodsDescription?: string; // Human-readable description of all accepted submission methods
}

export interface DocketAnalysis {
  summary: string; // Plain-language summary of what the docket is about
  commentingInstructions: CommentingInstructions;
  positions: {
    support: PositionAnalysis;
    oppose: PositionAnalysis;
    mixed: PositionAnalysis;
  };
  openForComment?: boolean; // Live status from Regulations.gov
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

  positions: {
    support: {
      position: 'support',
      summary: "Supporters believe enhanced security measures, including biometric verification and comprehensive vetting, are necessary to protect national security and prevent fraud in the visa waiver program.",
      reasonCards: [
        {
          id: 'sup-security',
          topic: 'Enhanced Security Verification',
          icon: 'shield',
          arguments: [
            {
              id: 'sup-sec-1',
              label: 'Biometric verification prevents identity fraud',
              expansion: 'The proposed facial recognition and liveness detection features will significantly reduce the ability of bad actors to submit fraudulent applications using stolen or fabricated identities, addressing documented exploitation of the current ESTA website.'
            },
            {
              id: 'sup-sec-2',
              label: 'NFC chip validation ensures passport authenticity',
              expansion: 'Requiring mobile-based e-Chip validation addresses the documented vulnerability where facilitators have created hundreds of fraudulent ESTAs using uploaded fraudulent passport bio pages.'
            },
            {
              id: 'sup-sec-3',
              label: 'Social media vetting aligns with national security needs',
              expansion: 'The collection of social media information supports the legitimate governmental interest in screening for potential security threats, consistent with Executive Order 14161 requirements.'
            }
          ]
        },
        {
          id: 'sup-fraud',
          topic: 'Fraud Prevention',
          icon: 'verified_user',
          arguments: [
            {
              id: 'sup-fraud-1',
              label: 'Eliminates third-party fraudulent website problem',
              expansion: 'Moving to mobile-only ESTA applications will effectively eliminate the documented problem of fraudulent third-party websites that charge exorbitant fees and fail to properly submit applications.'
            },
            {
              id: 'sup-fraud-2',
              label: 'Poor quality uploads can no longer bypass screening',
              expansion: 'The NTC TASU case study documenting over 2,400 poor quality uploads and 8,000 invalid photos demonstrates a clear vulnerability that mobile-based live capture would address.'
            }
          ]
        },
        {
          id: 'sup-efficiency',
          topic: 'Program Efficiency',
          icon: 'speed',
          arguments: [
            {
              id: 'sup-eff-1',
              label: 'Voluntary exit reporting closes information gaps',
              expansion: 'The VSRE pilot will help CBP reconcile entry and exit records, providing more accurate data on visa compliance and reducing incorrect overstay determinations that can harm legitimate travelers.'
            },
            {
              id: 'sup-eff-2',
              label: 'Mobile technology provides superior verification',
              expansion: 'The ESTA Mobile application offers technologically superior identity verification through liveness detection, facial recognition, and NFC-based passport scanning that the website cannot match.'
            }
          ]
        }
      ]
    },

    oppose: {
      position: 'oppose',
      summary: "Opponents argue the proposals are unnecessarily invasive, create significant barriers to travel, impose disproportionate burdens on applicants, and raise serious privacy and civil liberties concerns.",
      reasonCards: [
        {
          id: 'opp-necessity',
          topic: 'Necessity & Practical Utility',
          icon: 'lightbulb',
          arguments: [
            {
              id: 'opp-nec-1',
              label: 'Data collection is excessive for stated purpose',
              expansion: 'The collection of DNA, 10 years of email history, and extensive family member data far exceeds what is necessary for determining travel authorization eligibility, violating the principle of data minimization under the PRA.'
            },
            {
              id: 'opp-nec-2',
              label: 'No evidence linking family data to security outcomes',
              expansion: 'The agency has failed to demonstrate how collecting family members\' phone numbers, dates of birth, and residency information has practical utility for security screening that outweighs the privacy intrusion.'
            },
            {
              id: 'opp-nec-3',
              label: 'IP metadata collection lacks clear security nexus',
              expansion: 'The proposal to collect IP addresses and metadata from submitted photos has no demonstrated connection to determining whether an individual poses a security risk.'
            }
          ]
        },
        {
          id: 'opp-burden',
          topic: 'Accuracy of Burden Estimates',
          icon: 'timer',
          arguments: [
            {
              id: 'opp-bur-1',
              label: '22-minute estimate is grossly understated',
              expansion: 'The estimate of 22 minutes per ESTA Mobile application is factually incorrect; compiling 5 years of social media accounts, 10 years of email addresses, and detailed information about multiple family members will likely require hours.'
            },
            {
              id: 'opp-bur-2',
              label: 'Burden methodology ignores record retrieval time',
              expansion: 'The agency\'s burden calculation fails to account for the significant time required to retrieve historical phone numbers, email addresses, and contact information spanning 5-10 years.'
            }
          ]
        },
        {
          id: 'opp-access',
          topic: 'Access & Digital Divide',
          icon: 'smartphone',
          arguments: [
            {
              id: 'opp-acc-1',
              label: 'Mobile-only requirement excludes vulnerable populations',
              expansion: 'Decommissioning the ESTA website creates an unreasonable barrier for elderly travelers, those with disabilities affecting smartphone use, and travelers from regions with limited smartphone penetration.'
            },
            {
              id: 'opp-acc-2',
              label: 'No accommodation for travelers without NFC-capable phones',
              expansion: 'The mobile-only mandate requiring NFC chip verification fails to provide alternatives for the significant population of international travelers who do not possess NFC-capable smartphones.'
            },
            {
              id: 'opp-acc-3',
              label: 'Website alternative achieves security with less exclusion',
              expansion: 'Rather than eliminating the website entirely, the agency could implement improved photo quality checks and additional verification steps on the website while preserving access for those unable to use mobile applications.'
            }
          ]
        },
        {
          id: 'opp-privacy',
          topic: 'Privacy & Civil Liberties',
          icon: 'lock',
          arguments: [
            {
              id: 'opp-priv-1',
              label: 'Social media requirement chills free expression',
              expansion: 'Mandatory disclosure of 5 years of social media accounts will have a chilling effect on travelers\' protected speech and association, as individuals may self-censor or avoid participation in lawful online communities.'
            },
            {
              id: 'opp-priv-2',
              label: 'Family data collection violates third-party privacy',
              expansion: 'Requiring applicants to provide detailed personal information about parents, siblings, spouses, and children implicates the privacy rights of individuals who have not consented to government collection of their data.'
            },
            {
              id: 'opp-priv-3',
              label: 'Biometric collection creates surveillance concerns',
              expansion: 'The collection of facial images, fingerprints, iris scans, and DNA creates a comprehensive biometric database with significant potential for mission creep and surveillance beyond the stated travel authorization purpose.'
            }
          ]
        }
      ]
    },

    mixed: {
      position: 'mixed',
      summary: "A balanced perspective acknowledges legitimate security concerns while advocating for narrower data collection, preserved access alternatives, and stronger privacy safeguards.",
      reasonCards: [
        {
          id: 'mix-security',
          topic: 'Targeted Security Improvements',
          icon: 'tune',
          arguments: [
            {
              id: 'mix-sec-1',
              label: 'Support mobile verification, oppose website elimination',
              expansion: 'While mobile-based identity verification offers security benefits, the agency should maintain the ESTA website with enhanced verification measures rather than eliminating access for those unable to use mobile applications.'
            },
            {
              id: 'mix-sec-2',
              label: 'NFC validation is reasonable; social media overreaches',
              expansion: 'Passport chip validation represents a proportionate security measure, but mandatory social media disclosure for 5 years lacks demonstrated security necessity and should be voluntary or eliminated.'
            }
          ]
        },
        {
          id: 'mix-data',
          topic: 'Data Minimization',
          icon: 'filter_list',
          arguments: [
            {
              id: 'mix-data-1',
              label: 'Limit family data to immediate household members',
              expansion: 'If family information has legitimate security value, the collection should be limited to immediate household members rather than extending to all parents, siblings, and children regardless of residence.'
            },
            {
              id: 'mix-data-2',
              label: 'Reduce email/phone lookback to 2 years',
              expansion: 'The 10-year lookback for email addresses and 5-year lookback for phone numbers is excessive; a 2-year window would capture relevant current information while reducing burden and privacy intrusion.'
            },
            {
              id: 'mix-data-3',
              label: 'DNA collection should require specific justification',
              expansion: 'DNA collection is appropriate only where specific security concerns exist, not as a blanket requirement for all ESTA applicants.'
            }
          ]
        },
        {
          id: 'mix-implementation',
          topic: 'Implementation Safeguards',
          icon: 'policy',
          arguments: [
            {
              id: 'mix-impl-1',
              label: 'Require clear data retention and deletion policies',
              expansion: 'The agency should establish and publish specific retention periods and deletion procedures for the expanded data collection, particularly for biometric data and social media information.'
            },
            {
              id: 'mix-impl-2',
              label: 'Provide phase-in period for mobile transition',
              expansion: 'Rather than immediate website decommissioning, implement a 2-year transition period allowing travelers to adapt and ensuring mobile application reliability before eliminating alternatives.'
            },
            {
              id: 'mix-impl-3',
              label: 'Establish independent oversight for data use',
              expansion: 'Given the sensitivity of the expanded data collection, the agency should establish independent oversight mechanisms to ensure data is used only for stated travel authorization purposes.'
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
 */
export async function regenerateReasonCard(
  docketText: string,
  position: Position,
  cardTopic: string,
  existingArguments: string[] // Labels of arguments to avoid repeating
): Promise<ReasonCard> {
  console.log(`[ai-generator] regenerateReasonCard: position=${position}, topic=${cardTopic}`);

  if (!API_KEY) {
    console.log("[ai-generator] GEMINI_API_KEY not found, returning mock regeneration");
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return a slightly modified version of existing mock data
    const mockPosition = MOCK_DOCKET_ANALYSIS.positions[position];
    const existingCard = mockPosition.reasonCards.find(c => c.topic === cardTopic);
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
    return mockPosition.reasonCards[0];
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = await loadPrompt("regenerateReasonCard", {
    docketText,
    position,
    cardTopic,
    existingArguments: existingArguments.join('\n')
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("[ai-generator] Error regenerating reason card:", error);
    // Fallback to mock
    const mockPosition = MOCK_DOCKET_ANALYSIS.positions[position];
    return mockPosition.reasonCards[0];
  }
}

/**
 * Second AI call - Generate the final formatted comment based on user selections.
 */
export async function generateFinalComment(
  docketText: string,
  commentingInstructions: CommentingInstructions,
  position: Position,
  selectedArguments: ArgumentOption[],
  personalContext: {
    isExpert: boolean;
    affectsLivelihood: boolean;
    customText?: string;
  }
): Promise<string> {
  console.log(`[ai-generator] generateFinalComment: position=${position}, args=${selectedArguments.length}`);

  if (!API_KEY) {
    console.log("[ai-generator] GEMINI_API_KEY not found, using template-based generation");
    await new Promise(resolve => setTimeout(resolve, 1500));
    return buildTemplateComment(position, selectedArguments, personalContext);
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = await loadPrompt("generateFinalComment", {
    docketText: docketText.slice(0, 2000),
    format: commentingInstructions.format || 'Address the PRA factors',
    requiredPoints: commentingInstructions.requiredPoints?.join('; ') || 'Standard PRA factors',
    position,
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
    return buildTemplateComment(position, selectedArguments, personalContext);
  }
}

/**
 * Fallback template-based comment builder (no AI)
 */
function buildTemplateComment(
  position: Position,
  selectedArguments: ArgumentOption[],
  personalContext: {
    isExpert: boolean;
    affectsLivelihood: boolean;
    customText?: string;
  }
): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let comment = `${date}

To Whom It May Concern:

I am writing to submit my public comment on this proposed rulemaking. `;

  if (position === 'support') {
    comment += `I write in support of the proposed rule, with specific observations on its implementation.\n\n`;
  } else if (position === 'oppose') {
    comment += `I respectfully oppose the proposed rule as currently written for the following reasons.\n\n`;
  } else {
    comment += `While I appreciate the agency's objectives, I have both supportive observations and significant concerns that warrant consideration.\n\n`;
  }

  if (personalContext.isExpert || personalContext.affectsLivelihood) {
    comment += `STATEMENT OF INTEREST\n\n`;
    if (personalContext.isExpert) {
      comment += `I am a subject matter expert with direct knowledge of the issues addressed by this proposal. `;
    }
    if (personalContext.affectsLivelihood) {
      comment += `This regulation will directly impact my professional livelihood and business operations. `;
    }
    comment += `\n\n`;
  }

  comment += `SUBSTANTIVE COMMENTS\n\n`;

  selectedArguments.forEach((arg, index) => {
    comment += `${index + 1}. ${arg.label}\n\n${arg.expansion}\n\n`;
  });

  if (personalContext.customText) {
    comment += `ADDITIONAL COMMENTS\n\n${personalContext.customText}\n\n`;
  }

  comment += `CONCLUSION\n\nFor the foregoing reasons, I urge the agency to carefully consider these comments in its deliberations. Thank you for the opportunity to participate in this rulemaking process.

Respectfully submitted,

[Your Name]
[Your Address]
[Your Email]`;

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
  const positionKey = stance as Position;
  const positionData = analysis.positions[positionKey] || analysis.positions.oppose;

  // Convert new format to legacy format
  return positionData.reasonCards.map(card => ({
    id: card.id,
    title: card.topic,
    icon: card.icon,
    options: card.arguments
  }));
}
