import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import {
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "@/lib/signal-prompt";
import {
  SECTION_KEYS,
  SectionKey,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  ReportFragment,
} from "@/lib/insights-prompt";

export const maxDuration = 60;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MIN_REPORTS = 2;
const MAX_REPORTS = 100;

function isSectionKey(value: unknown): value is SectionKey {
  return (
    typeof value === "string" &&
    (SECTION_KEYS as readonly string[]).includes(value)
  );
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://dreamfree.co.uk",
        "X-OpenRouter-Title": "Dreamfree Signal Insights",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
  }

  const data = await res.json();

  // OpenRouter sometimes returns 200 with an error body.
  if (data.error) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error.message || JSON.stringify(data.error);
    throw new Error(`OpenRouter error: ${message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(
      `Empty response from OpenRouter (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }
  return content;
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { section, count } = body as { section?: unknown; count?: unknown };

  if (!isSectionKey(section)) {
    return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_REPORTS ||
    count > MAX_REPORTS
  ) {
    return NextResponse.json({ error: "invalid_count" }, { status: 400 });
  }

  const reports = await convex.query(
    api.signalInsights.latestReportsForSection,
    { section, count },
  );

  if (reports.length < MIN_REPORTS) {
    return NextResponse.json(
      { error: "not_enough_reports", available: reports.length },
      { status: 422 },
    );
  }

  const fragments: ReportFragment[] = reports.map((r) => ({
    url: r.url,
    customerDescription: r.customerDescription,
    overallScore: r.overallScore,
    sectionData: r.sectionData,
  }));

  const userPrompt = buildInsightsUserPrompt(section, fragments);

  let raw: string;
  let modelUsed = OPENROUTER_MODEL_PRIMARY;
  try {
    raw = await callOpenRouter(
      OPENROUTER_MODEL_PRIMARY,
      INSIGHTS_SYSTEM_PROMPT,
      userPrompt,
    );
  } catch (primaryErr) {
    const primaryMsg =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    try {
      modelUsed = OPENROUTER_MODEL_FALLBACK;
      raw = await callOpenRouter(
        OPENROUTER_MODEL_FALLBACK,
        INSIGHTS_SYSTEM_PROMPT,
        userPrompt,
      );
    } catch (fallbackErr) {
      const fallbackMsg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      console.error("Insights generation failed", {
        primary: primaryMsg,
        fallback: fallbackMsg,
      });
      return NextResponse.json(
        {
          error: "llm_failed",
          detail: { primary: primaryMsg, fallback: fallbackMsg },
        },
        { status: 502 },
      );
    }
  }

  let parsed;
  try {
    parsed = parseInsightResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Invalid LLM response", msg, raw.slice(0, 500));
    return NextResponse.json(
      {
        error: "invalid_llm_response",
        detail: msg,
        sample: raw.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const insightId = await convex.mutation(api.signalInsights.insertInsight, {
    section,
    reportCount: reports.length,
    reportsAnalysed: reports.map((r) => r._id),
    summary: parsed.summary,
    contentIdeas: parsed.contentIdeas,
    modelUsed,
  });

  return NextResponse.json({
    insightId,
    reportCount: reports.length,
  });
}
