import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  buildSignalPrompt,
  calculateOverallScore,
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "../lib/signal-prompt";

const PER_MODEL_TIMEOUT_MS = 90_000;

interface SignalElement {
  score: number;
  summary: string;
  analysis: string;
  businessImpact: string;
  recommendations: string[];
}

interface LlmResult {
  gruntTest: { pass: boolean; explanation: string };
  elements: {
    character: SignalElement;
    problem: SignalElement;
    guide: SignalElement;
    plan: SignalElement;
    cta: SignalElement;
    stakes: SignalElement;
    transformation: SignalElement;
  };
  quickWin: string;
  strengths: string[];
  fullSummary: string;
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmResult> {
  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://dreamfree.co.uk",
        "X-OpenRouter-Title": "Dreamfree Signal Score",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
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

  const cleaned = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned);
}

export const runReportGeneration = internalAction({
  args: {
    reportId: v.id("signalReports"),
    strippedContent: v.string(),
    customerDescription: v.string(),
    firstName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    url: v.string(),
    anonymousId: v.string(),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { system, user } = buildSignalPrompt(
      args.strippedContent,
      args.customerDescription,
    );

    let result: LlmResult;
    let modelUsed = OPENROUTER_MODEL_PRIMARY;

    try {
      result = await callOpenRouter(OPENROUTER_MODEL_PRIMARY, system, user);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      try {
        modelUsed = OPENROUTER_MODEL_FALLBACK;
        result = await callOpenRouter(OPENROUTER_MODEL_FALLBACK, system, user);
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        console.error("Signal report generation failed", {
          reportId: args.reportId,
          primary: primaryMsg,
          fallback: fallbackMsg,
        });
        await ctx.runMutation(internal.signalReports.failReport, {
          reportId: args.reportId,
          status: "llm_failed",
        });
        return;
      }
    }

    const overallScore = calculateOverallScore(result.elements);

    await ctx.runMutation(internal.signalReports.completeReport, {
      reportId: args.reportId,
      overallScore,
      gruntTest: result.gruntTest,
      elements: result.elements,
      quickWin: result.quickWin,
      strengths: result.strengths,
      fullSummary: result.fullSummary,
    });

    // Fire emails + form submission AFTER the report is patched
    // so any retries / opens land on the complete report.
    const emailResults = await Promise.allSettled([
      ctx.runAction(api.emails.sendSignalScoreToVisitor, {
        firstName: args.firstName,
        email: args.email,
        url: args.url,
        overallScore,
        gruntTestPass: result.gruntTest.pass,
        reportId: args.reportId as string,
        verifyCode: args.verifyCode,
        verifyToken: args.verifyToken,
      }),
      ctx.runAction(api.emails.sendSignalScoreToAdmin, {
        firstName: args.firstName,
        email: args.email,
        url: args.url,
        customerDescription: args.customerDescription,
        overallScore,
        elementScores: {
          character: result.elements.character.score,
          problem: result.elements.problem.score,
          guide: result.elements.guide.score,
          plan: result.elements.plan.score,
          cta: result.elements.cta.score,
          stakes: result.elements.stakes.score,
          transformation: result.elements.transformation.score,
        },
      }),
      ctx.runMutation(api.formSubmissions.submitSignalScore, {
        url: args.url,
        customerDescription: args.customerDescription,
        firstName: args.firstName,
        email: args.email,
        score: overallScore,
        reportId: args.reportId as string,
        anonymousId: args.anonymousId,
      }),
    ]);

    emailResults.forEach((r, i) => {
      if (r.status === "rejected") {
        const labels = ["Visitor email", "Admin email", "Form submission"];
        console.error(`${labels[i]} failed`, r.reason);
      }
    });

    console.log(
      `runReportGeneration complete: reportId=${args.reportId} score=${overallScore} model=${modelUsed}`,
    );
  },
});
