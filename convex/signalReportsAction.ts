import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  buildSignalPrompt,
  calculateOverallScore,
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
    // When true, skip the inbound-flow side effects:
    //   - the "your report is ready" email to the visitor (API caller emails
    //     the prospect themselves)
    //   - submitSignalScore (which would add `signal_score` to sources and
    //     promote leadType outbound→inbound — neither is correct for an
    //     API-generated report)
    //   - tryEnrolFromReport (no marketing consent from an API-only lead)
    // We still send the admin notification so Daniel sees the new report.
    // Optional + defaults to false to keep older callers (and existing
    // scheduled functions still in the queue) working unchanged.
    isApiReport: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { system, user } = buildSignalPrompt(
      args.strippedContent,
      args.customerDescription,
    );

    const { primary, fallback } = await ctx.runQuery(
      internal.aiModels.resolveModelsInternal,
      { useCase: "signal_reports" },
    );

    let result: LlmResult;
    let modelUsed = primary;

    try {
      result = await callOpenRouter(primary, system, user);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      try {
        modelUsed = fallback;
        result = await callOpenRouter(fallback, system, user);
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
          error: `primary=${primaryMsg}; fallback=${fallbackMsg}`.slice(0, 1000),
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

    const isApiReport = args.isApiReport === true;

    // Admin notification fires for every successful report — including API
    // ones — so Daniel sees the new audit in his inbox regardless of source.
    const adminEmailTasks: Promise<unknown>[] = [
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
    ];

    // Inbound-only side effects: the magic-link email to the prospect, and
    // the `submitSignalScore` mutation that records a formSubmission and
    // promotes the lead to inbound. NEITHER is appropriate for API-created
    // reports — the caller emails the prospect themselves, and the prospect
    // never filled in a form to consent.
    if (!isApiReport) {
      adminEmailTasks.push(
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
        ctx.runMutation(api.formSubmissions.submitSignalScore, {
          url: args.url,
          customerDescription: args.customerDescription,
          firstName: args.firstName,
          email: args.email,
          score: overallScore,
          reportId: args.reportId as string,
          anonymousId: args.anonymousId,
        }),
      );
    }

    const emailResults = await Promise.allSettled(adminEmailTasks);

    emailResults.forEach((r, i) => {
      if (r.status === "rejected") {
        const labels = isApiReport
          ? ["Admin email"]
          : ["Admin email", "Visitor email", "Form submission"];
        console.error(`${labels[i] ?? "task " + i} failed`, r.reason);
      }
    });

    // Attempt to enrol the lead in the marketing email campaign. SKIP for
    // API-created reports — the prospect did not opt in to marketing emails
    // by being POSTed to /api/v1/signal-reports, only by submitting an
    // inbound form. `tryEnrolFromReport` also defends against this via its
    // sources check, but skipping at the call site avoids the log noise
    // and any future drift in that guard.
    if (!isApiReport) {
      try {
        const enrollmentId = await ctx.runMutation(
          internal.emailCampaigns.tryEnrolFromReport,
          { reportId: args.reportId },
        );
        if (enrollmentId) {
          await ctx.scheduler.runAfter(
            0,
            internal.emailCampaignsAction.generateSequence,
            { enrollmentId },
          );
          console.log(
            `Email campaign enrolment scheduled for report ${args.reportId} → enrollment ${enrollmentId}`,
          );
        }
      } catch (err) {
        console.error(
          `Email campaign enrolment failed for report ${args.reportId}:`,
          err,
        );
      }
    }

    console.log(
      `runReportGeneration complete: reportId=${args.reportId} score=${overallScore} model=${modelUsed}`,
    );
  },
});
