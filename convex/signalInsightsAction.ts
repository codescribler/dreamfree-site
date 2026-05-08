import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  ReportFragment,
  SectionKey,
} from "../lib/insights-prompt";

const PER_MODEL_TIMEOUT_MS = 90_000;

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
      signal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`,
    );
  }

  const data = await res.json();

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
      `Empty response (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }
  return content;
}

export const runInsightGeneration = internalAction({
  args: { insightId: v.id("signalInsights") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.signalInsights.getReportsForInsight,
      { insightId: args.insightId },
    );

    if (!data) {
      console.error(
        "runInsightGeneration: insight not found",
        args.insightId,
      );
      return;
    }

    const fragments: ReportFragment[] = data.reports;
    const userPrompt = buildInsightsUserPrompt(
      data.section as SectionKey,
      fragments,
    );

    const { primary, fallback } = await ctx.runQuery(
      internal.aiModels.resolveModelsInternal,
      { useCase: "signal_insights" },
    );

    let raw: string;
    let modelUsed = primary;

    try {
      raw = await callOpenRouter(primary, INSIGHTS_SYSTEM_PROMPT, userPrompt);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      try {
        modelUsed = fallback;
        raw = await callOpenRouter(fallback, INSIGHTS_SYSTEM_PROMPT, userPrompt);
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        await ctx.runMutation(internal.signalInsights.failInsight, {
          insightId: args.insightId,
          errorMessage: `Both models failed.\nPrimary: ${primaryMsg}\nFallback: ${fallbackMsg}`,
        });
        return;
      }
    }

    let parsed;
    try {
      parsed = parseInsightResponse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.signalInsights.failInsight, {
        insightId: args.insightId,
        errorMessage: `Invalid LLM response: ${msg}\nFirst 500 chars: ${raw.slice(0, 500)}`,
      });
      return;
    }

    await ctx.runMutation(internal.signalInsights.completeInsight, {
      insightId: args.insightId,
      summary: parsed.summary,
      contentIdeas: parsed.contentIdeas,
      modelUsed,
    });
  },
});
