export const SECTION_KEYS = [
  "character",
  "problem",
  "guide",
  "plan",
  "cta",
  "stakes",
  "transformation",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  character: "Character (The Hero)",
  problem: "Problem",
  guide: "Guide (Credibility)",
  plan: "Plan",
  cta: "Call to Action",
  stakes: "Stakes (Failure)",
  transformation: "Transformation (Success)",
};

export const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  character: "the Hero — who the customer is and what they want",
  problem:
    "the Problem — the external, internal, and philosophical pain the customer faces",
  guide:
    "the Guide — credibility, empathy, and authority that positions the brand to help",
  plan: "the Plan — the simple, clear steps the customer needs to take",
  cta: "the Call to Action — direct and transitional CTAs",
  stakes:
    "the Stakes — what is at risk if the customer does not act (failure)",
  transformation:
    "the Transformation — the success state the customer becomes",
};

export const INSIGHTS_SYSTEM_PROMPT = `You are a content strategist analysing patterns across website messaging audits. The audits use the StoryBrand SB7 framework, scoring 7 elements 1–10. You'll be given a batch of audit fragments for a single element across many different businesses. Your job: surface patterns useful for marketing content (LinkedIn posts, email lessons, talks).

Look for: recurring failure modes, surprising patterns, niche or industry-specific behaviours, common excuses or blind spots, examples of strong execution. Prioritise insights that would make someone reading a LinkedIn post say "that's me" or "I never thought of it that way."

Be specific. Avoid generic advice ("websites should be clear"). Quote or paraphrase real patterns from the data.

Output strict JSON only — no markdown code fences, no commentary before or after:

{
  "summary": "<markdown analysis, 200-400 words, with ## subheadings for each major pattern>",
  "contentIdeas": [
    { "hook": "<scroll-stopping headline>", "angle": "<2 sentences on what to write and why it works>", "format": "<LinkedIn post | email lesson | tweet | video script>" }
  ]
}

Aim for 5-10 content ideas, varied in format.`;

export interface ReportFragment {
  url: string;
  customerDescription: string;
  overallScore: number;
  sectionData: {
    score: number;
    summary: string;
    analysis: string;
    businessImpact: string;
    recommendations: string[];
  };
}

export function buildInsightsUserPrompt(
  section: SectionKey,
  reports: ReportFragment[],
): string {
  const header = `Element under analysis: **${SECTION_LABELS[section]}** — ${SECTION_DESCRIPTIONS[section]}.

Below are ${reports.length} audit fragments from different businesses. Each shows the business URL, a short customer description, the overall site score, and the section-specific findings.

`;

  const blocks = reports
    .map((r, i) => {
      const recs =
        r.sectionData.recommendations.length === 0
          ? "      (none)"
          : r.sectionData.recommendations
              .map((rec) => `      - ${rec}`)
              .join("\n");
      return `[${i + 1}] URL: ${r.url}  |  Customer: "${r.customerDescription}"  |  Overall: ${r.overallScore}/100
    Section score: ${r.sectionData.score}/10
    Summary: ${r.sectionData.summary}
    Analysis: ${r.sectionData.analysis}
    Business impact: ${r.sectionData.businessImpact}
    Recommendations:
${recs}`;
    })
    .join("\n\n");

  return header + blocks;
}

export interface ContentIdea {
  hook: string;
  angle: string;
  format?: string;
}

export interface ParsedInsight {
  summary: string;
  contentIdeas: ContentIdea[];
}

/** Parse the LLM's JSON response. Throws on invalid shape. */
export function parseInsightResponse(raw: string): ParsedInsight {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Response was not an object");
  }
  if (typeof parsed.summary !== "string" || parsed.summary.length === 0) {
    throw new Error("Missing or empty `summary` string");
  }
  if (!Array.isArray(parsed.contentIdeas)) {
    throw new Error("Missing `contentIdeas` array");
  }

  const contentIdeas: ContentIdea[] = parsed.contentIdeas.map(
    (idea: unknown, i: number) => {
      if (typeof idea !== "object" || idea === null) {
        throw new Error(`contentIdeas[${i}] is not an object`);
      }
      const obj = idea as Record<string, unknown>;
      if (typeof obj.hook !== "string" || obj.hook.length === 0) {
        throw new Error(`contentIdeas[${i}].hook missing`);
      }
      if (typeof obj.angle !== "string" || obj.angle.length === 0) {
        throw new Error(`contentIdeas[${i}].angle missing`);
      }
      const result: ContentIdea = { hook: obj.hook, angle: obj.angle };
      if (typeof obj.format === "string" && obj.format.length > 0) {
        result.format = obj.format;
      }
      return result;
    },
  );

  return { summary: parsed.summary, contentIdeas };
}
