import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import {
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "@/lib/signal-prompt";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const MAX_USES = 3;

const SYSTEM_PROMPT = `You are an expert content strategist who creates highly specific, actionable content plans for UK small businesses. You understand SEO, the AI search era, and what actually drives enquiries for local and service businesses.

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

interface GeneratorInput {
  name: string;
  email: string;
  businessDescription: string;
  goal: string;
  channelsTried: string[];
  frustration: string;
  timePerWeek: string;
  website?: string;
  anonymousId?: string;
  leadId?: string;
}

interface ContentIdea {
  title: string;
  format: string;
  keyword: string;
  why: string;
  brief: string;
  timeEstimate: string;
  priority: number;
}

interface LlmResult {
  summary: string;
  ideas: ContentIdea[];
}

function buildUserPrompt(input: GeneratorInput): string {
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

async function callOpenRouter(
  model: string,
  input: GeneratorInput,
): Promise<LlmResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": "Dreamfree Content Idea Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from OpenRouter");
  }

  const cleaned = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  return JSON.parse(cleaned) as LlmResult;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name, email, businessDescription, goal,
    channelsTried, frustration, timePerWeek, website,
    anonymousId, leadId,
  } = body as GeneratorInput & { leadId?: string };

  if (!name || !businessDescription || !goal || !frustration || !timePerWeek) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Rate limit — 3 uses per person, unless admin
  const session = await verifySession();
  const isAdmin = session?.isAdmin === true;

  if (!isAdmin && anonymousId) {
    const useCount = await convex.query(api.contentPlans.countUses, {
      anonymousId,
      email,
    });
    if (useCount >= MAX_USES) {
      return NextResponse.json(
        { error: "rate_limited", message: "You've used all 3 free content plans. Get in touch if you'd like more.", usesRemaining: 0 },
        { status: 429 },
      );
    }
  }

  const input: GeneratorInput = {
    name, email, businessDescription, goal,
    channelsTried: channelsTried ?? [],
    frustration, timePerWeek, website,
  };

  let result: LlmResult;
  const startTime = Date.now();
  try {
    console.log(`[content-ideas] Calling primary model: ${OPENROUTER_MODEL_PRIMARY}`);
    result = await callOpenRouter(OPENROUTER_MODEL_PRIMARY, input);
    console.log(`[content-ideas] Primary model succeeded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (primaryErr) {
    console.log(`[content-ideas] Primary model failed after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
    const fallbackStart = Date.now();
    try {
      console.log(`[content-ideas] Calling fallback model: ${OPENROUTER_MODEL_FALLBACK}`);
      result = await callOpenRouter(OPENROUTER_MODEL_FALLBACK, input);
      console.log(`[content-ideas] Fallback model succeeded in ${((Date.now() - fallbackStart) / 1000).toFixed(1)}s`);
    } catch (fallbackErr) {
      console.log(`[content-ideas] Fallback model failed after ${((Date.now() - fallbackStart) / 1000).toFixed(1)}s:`, fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
      return NextResponse.json(
        { error: "llm_failed", message: "Something went wrong generating your plan. Please try again." },
        { status: 500 },
      );
    }
  }

  // Save the structured plan to Convex
  let planId: string | undefined;
  if (leadId) {
    try {
      planId = await convex.mutation(api.contentPlans.savePlan, {
        leadId: leadId as any,
        anonymousId,
        input: {
          name: input.name,
          email: input.email,
          businessDescription: input.businessDescription,
          goal: input.goal,
          channelsTried: input.channelsTried,
          frustration: input.frustration,
          timePerWeek: input.timePerWeek,
          website: input.website,
        },
        summary: result.summary,
        ideas: result.ideas,
      });
      console.log(`[content-ideas] Plan saved: ${planId}`);
    } catch (err) {
      console.error("[content-ideas] Failed to save plan:", err);
      // Don't fail the request — still return the plan
    }
  }

  console.log(`[content-ideas] Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return NextResponse.json({ planId, summary: result.summary, ideas: result.ideas });
}
