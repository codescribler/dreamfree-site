import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import {
  CONTENT_IDEAS_SYSTEM_PROMPT,
  buildContentIdeasUserPrompt,
  type ContentIdeasInput,
  type ContentIdeasResult,
} from "@/lib/ai/prompts/content-ideas";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const MAX_USES = 3;

interface GeneratorInput extends ContentIdeasInput {
  anonymousId?: string;
  leadId?: string;
}

async function callOpenRouter(
  model: string,
  input: ContentIdeasInput,
): Promise<ContentIdeasResult> {
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
        { role: "system", content: CONTENT_IDEAS_SYSTEM_PROMPT },
        { role: "user", content: buildContentIdeasUserPrompt(input) },
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

  return JSON.parse(cleaned) as ContentIdeasResult;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name, email, businessDescription, goal,
    channelsTried, frustration, timePerWeek, website,
    anonymousId, leadId,
  } = body as GeneratorInput;

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

  const input: ContentIdeasInput = {
    name, email, businessDescription, goal,
    channelsTried: channelsTried ?? [],
    frustration, timePerWeek, website,
  };

  const { primary: MODEL_PRIMARY, fallback: MODEL_FALLBACK } =
    await convex.query(api.aiModels.resolveModelsPublic, {
      useCase: "content_ideas",
    });

  let result: ContentIdeasResult;
  const startTime = Date.now();
  try {
    console.log(`[content-ideas] Calling primary model: ${MODEL_PRIMARY}`);
    result = await callOpenRouter(MODEL_PRIMARY, input);
    console.log(`[content-ideas] Primary model succeeded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (primaryErr) {
    console.log(`[content-ideas] Primary model failed after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
    const fallbackStart = Date.now();
    try {
      console.log(`[content-ideas] Calling fallback model: ${MODEL_FALLBACK}`);
      result = await callOpenRouter(MODEL_FALLBACK, input);
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
