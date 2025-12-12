import { StanceType } from '@/components/StanceSelector';

interface CommentContext {
  docketId: string;
  agencyName: string;
  stance: StanceType | null;
  selectedReasoningIds: string[];
  impact: {
    expertise: boolean;
    livelihood: boolean;
  };
  reasoningMap: Record<string, string>;
  customContent?: string;
}

export function buildCommentDraft(ctx: CommentContext): string {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 1. Header with Required Fields
  let draft = `Date: ${date}\n\n`;
  draft += `Agency: ${ctx.agencyName}\n`;
  draft += `Docket No.: ${ctx.docketId}\n`;
  draft += `Re: Public Comment on Proposed Rule\n\n`;

  // 2. Opening Salutation
  draft += `To Whom It May Concern:\n\n`;

  // 3. Position Statement
  draft += `I am writing to formally submit my comments regarding Docket No. ${ctx.docketId}. `;
  
  if (ctx.stance === 'oppose') {
    draft += `I strongly oppose the proposed rule as currently written. `;
  } else if (ctx.stance === 'support') {
    draft += `I write in support of the proposed rule, though I have specific feedback for its implementation. `;
  } else {
    draft += `While I understand the intent behind this proposal, I have significant concerns regarding its implementation and impact. `;
  }

  // 4. Personal Standing (Impact)
  if (ctx.impact.expertise || ctx.impact.livelihood) {
    draft += `\n\nMy perspective is informed by my direct experience. `;
    if (ctx.impact.expertise) {
      draft += `As a subject matter expert in this field, I have analyzed the technical implications of this proposal. `;
    }
    if (ctx.impact.livelihood) {
      draft += `Furthermore, this regulation would directly impact my professional livelihood and business operations. `;
    }
  }

  // 5. Core Arguments (The "Meat")
  if (ctx.selectedReasoningIds.length > 0) {
    draft += `\n\nMy comments focus on the following key areas:\n`;

    ctx.selectedReasoningIds.forEach((id) => {
      // Use the expansion text if available (passed as the value in reasoningMap)
      const argumentText = ctx.reasoningMap[id];
      if (argumentText) {
        draft += `\n• ${argumentText}`;
      }
    });
  }

  // 6. Custom/Additional Content
  if (ctx.customContent && ctx.customContent.trim()) {
    draft += `\n\nAdditionally, I wish to emphasize the following points:\n\n${ctx.customContent.trim()}`;
  }

  // 7. Conclusion
  draft += `\n\nFor these reasons, I urge the ${ctx.agencyName} to reconsider the proposed collection of information. Thank you for your consideration of these comments.\n\n`;

  // 8. Sign-off
  draft += `Sincerely,\n\n[Your Name]`;

  return draft;
}
