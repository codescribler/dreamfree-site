// lib/ai/prompts/content-ideas.ts

export interface ContentIdeasInput {
  name: string;
  email: string;
  businessDescription: string;
  goal: string;
  channelsTried: string[];
  frustration: string;
  timePerWeek: string;
  website?: string;
}

export interface ContentIdea {
  title: string;
  format: string;
  keyword: string;
  why: string;
  brief: string;
  timeEstimate: string;
  priority: number;
}

export interface ContentIdeasResult {
  summary: string;
  ideas: ContentIdea[];
}

export const CONTENT_IDEAS_SYSTEM_PROMPT = `You are an expert content strategist who creates highly specific, actionable content plans for UK small businesses. You understand SEO, the AI search era, and what actually drives enquiries for local and service businesses.

You will receive detailed context about a business: what they do, who they serve, their main goal, what marketing they've tried, their biggest frustration, and how much time they have. Use ALL of this context to create a plan that feels personally crafted — not generic.

You MUST respond with valid JSON only — no markdown, no code fences, no commentary outside the JSON.

Return this exact structure:
{
  "summary": "A 2-3 sentence overview of the strategy — why this plan suits their specific business, goal, and time budget.",
  "ideas": [
    {
      "title": "A specific, ready-to-use title they could publish as-is",
      "format": "blog article | case study | video script | interactive tool | email sequence | social series | guide",
      "keyword": "A realistic target keyword or search phrase for a small business",
      "why": "One sentence explaining why this idea works for THEIR specific business and goal",
      "brief": "3-4 sentences explaining the angle, structure, and what to include. Detailed enough to hand to a writer.",
      "timeEstimate": "e.g. 2-3 hours, 30 minutes, 1 hour",
      "priority": 1
    }
  ]
}

Rules:
- Produce exactly 6 ideas, numbered by priority (1 = highest impact, do this first)
- If they've tried channels before, build on what they know — don't suggest starting from scratch
- If their goal is leads, weight ideas toward conversion. If authority, weight toward depth and shareability
- If they say they'd rather outsource, make the briefs detailed enough to hand to a writer or agency
- Match the plan's total time commitment to their stated weekly availability across 90 days
- Use UK English throughout. Reference UK-specific platforms and behaviours where relevant
- Be specific to their industry. A plumber gets different ideas than an accountant
- Never suggest "start a blog" as an idea. Every idea must be a specific piece of content with a clear angle
- The summary should reference their business name/type and stated goal`;

export function buildContentIdeasUserPrompt(input: ContentIdeasInput): string {
  const channels =
    input.channelsTried.length > 0
      ? input.channelsTried.join(", ")
      : "Nothing yet";

  return `Business owner: ${input.name}
${input.website ? `Website: ${input.website}` : "No website provided"}

About their business:
${input.businessDescription}

Primary goal: ${input.goal}

Marketing channels they've already tried: ${channels}

Their biggest frustration with marketing right now:
${input.frustration}

Time available for content each week: ${input.timePerWeek}

Create a personalised 90-day content plan for ${input.name}'s business. Respond with JSON only.`;
}
