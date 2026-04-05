import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { stripHtml } from "@/lib/html-stripper";
import {
  buildSignalPrompt,
  calculateOverallScore,
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "@/lib/signal-prompt";
import { randomInt, randomBytes } from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MAX_USES = 3;

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

interface RunLog {
  timestamp: string;
  url: string;
  email: string;
  firstName: string;
  phone?: string;
  anonymousId: string;
  customerDescription: string;
  steps: string[];
  outcome: "success" | "rate_limited" | "fetch_failed" | "llm_failed" | "error";
  overallScore?: number;
  errorDetail?: string;
  durationMs: number;
}

async function sendRunLogEmail(log: RunLog) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const outcomeColour =
    log.outcome === "success"
      ? "#0d7377"
      : log.outcome === "rate_limited"
        ? "#e6a817"
        : "#e03131";

  const stepsHtml = log.steps
    .map(
      (s, i) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;">${i + 1}</td><td style="padding:4px 0;font-size:13px;">${s}</td></tr>`,
    )
    .join("");

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dreamfree <notifications@dreamfree.co.uk>",
        to: "daniel@dreamfree.co.uk",
        subject: `[Signal Log] ${log.outcome.toUpperCase()} — ${log.url} (${log.email})`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;">
            <h2 style="margin:0 0 16px;">Signal Score Run Log</h2>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
              <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;">Time</td><td style="padding:6px 0;">${log.timestamp}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;">Duration</td><td style="padding:6px 0;">${(log.durationMs / 1000).toFixed(1)}s</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;">Outcome</td><td style="padding:6px 0;"><span style="background:${outcomeColour};color:#fff;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;">${log.outcome}</span></td></tr>
              ${log.overallScore !== undefined ? `<tr><td style="padding:6px 12px 6px 0;color:#888;">Score</td><td style="padding:6px 0;font-weight:700;font-size:18px;">${log.overallScore}/100</td></tr>` : ""}
              <tr><td style="padding:6px 12px 6px 0;color:#888;">URL</td><td style="padding:6px 0;"><a href="${log.url}">${log.url}</a></td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Name</td><td style="padding:6px 0;">${log.firstName}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Email</td><td style="padding:6px 0;">${log.email}</td></tr>
              ${log.phone ? `<tr><td style="padding:6px 12px 6px 0;color:#888;">Phone</td><td style="padding:6px 0;">${log.phone}</td></tr>` : ""}
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Customer</td><td style="padding:6px 0;">${log.customerDescription}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#888;">Anonymous ID</td><td style="padding:6px 0;font-size:12px;font-family:monospace;">${log.anonymousId}</td></tr>
            </table>
            ${log.errorDetail ? `<div style="margin:16px 0;padding:12px;background:#fff0f0;border-left:3px solid #e03131;font-size:13px;"><strong>Error:</strong> ${log.errorDetail}</div>` : ""}
            <h3 style="margin:20px 0 8px;font-size:14px;">Steps Completed</h3>
            <table style="border-collapse:collapse;width:100%;">${stepsHtml}</table>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error("Run log email failed:", err);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const steps: string[] = [];
  const body = await req.json();
  const { url, customerDescription, firstName, email, anonymousId, phone } = body as {
    url: string;
    customerDescription: string;
    firstName: string;
    email: string;
    anonymousId: string;
    phone?: string;
  };

  const logBase = {
    timestamp: new Date().toISOString(),
    url: url || "(empty)",
    email: email || "(empty)",
    firstName: firstName || "(empty)",
    phone,
    anonymousId: anonymousId || "(empty)",
    customerDescription: customerDescription || "(empty)",
  };

  if (!url || !email || !firstName || !customerDescription || !anonymousId) {
    steps.push("Rejected: missing required fields");
    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "error",
      errorDetail: "Missing required fields",
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  steps.push(`Received request for ${url} from ${email}`);

  // 1. Rate limit check
  let useCount: number;
  try {
    useCount = await convex.query(api.signalReports.countUses, {
      anonymousId,
      email,
    });
    steps.push(`Rate limit check: ${useCount}/${MAX_USES} uses`);
  } catch (err) {
    steps.push("Rate limit check FAILED");
    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "error",
      errorDetail: `Convex query failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "server_error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  if (useCount >= MAX_USES) {
    const leadId = await convex.mutation(api.leads.upsertLeadPublic, {
      email,
      firstName,
      phone,
      website: url,
      source: "signal_score",
      anonymousId,
    });
    steps.push("Lead upserted (rate limited)");

    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "rate_limited",
    });
    steps.push("Saved failed report (rate_limited)");

    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "rate_limited",
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ error: "rate_limited", usesRemaining: 0 });
  }

  // 2. Create/upsert lead early so we have the ID
  const leadId = await convex.mutation(api.leads.upsertLeadPublic, {
    email,
    firstName,
    website: url,
    source: "signal_score",
    anonymousId,
  });
  steps.push(`Lead upserted: ${leadId}`);

  // 3. Fetch the website HTML
  let rawHtml: string;
  try {
    const siteUrl = url.startsWith("http") ? url : `https://${url}`;
    const response = await fetch(siteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DreamfreeBot/1.0; +https://dreamfree.co.uk)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    rawHtml = await response.text();
    steps.push(`Website fetched: ${rawHtml.length} chars`);
  } catch (err) {
    steps.push(`Website fetch FAILED: ${err instanceof Error ? err.message : String(err)}`);

    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
    });

    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "fetch_failed",
      errorDetail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      error: "fetch_failed",
      message:
        "We couldn't reach that website. Please check the URL and try again.",
      usesRemaining: MAX_USES - useCount,
    });
  }

  // 4. Strip HTML to meaningful content
  const strippedContent = stripHtml(rawHtml);
  steps.push(`HTML stripped: ${strippedContent.length} chars of content`);

  if (strippedContent.length < 100) {
    steps.push("Content too short (<100 chars)");

    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
    });

    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "fetch_failed",
      errorDetail: `Only ${strippedContent.length} chars of content extracted`,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      error: "fetch_failed",
      message:
        "We couldn't read enough content from that page. It may use JavaScript rendering that we can't process. Try a different page URL.",
      usesRemaining: MAX_USES - useCount,
    });
  }

  // 5. Call OpenRouter (with model fallback)
  const { system, user } = buildSignalPrompt(
    strippedContent,
    customerDescription,
  );

  async function callOpenRouter(model: string): Promise<LlmResult> {
    const openRouterResponse = await fetch(
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
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.3,
        }),
      },
    );

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter HTTP ${openRouterResponse.status}`);
    }

    const data = await openRouterResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from OpenRouter");
    }

    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned);
  }

  let llmResult: LlmResult;
  let modelUsed = OPENROUTER_MODEL_PRIMARY;
  try {
    llmResult = await callOpenRouter(OPENROUTER_MODEL_PRIMARY);
    steps.push(`LLM analysis complete (${OPENROUTER_MODEL_PRIMARY})`);
  } catch (primaryErr) {
    steps.push(`Primary model failed: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`);
    try {
      modelUsed = OPENROUTER_MODEL_FALLBACK;
      llmResult = await callOpenRouter(OPENROUTER_MODEL_FALLBACK);
      steps.push(`LLM analysis complete (fallback: ${OPENROUTER_MODEL_FALLBACK})`);
    } catch (fallbackErr) {
      steps.push(`Fallback model failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);

      await convex.mutation(api.signalReports.saveFailedReport, {
        leadId,
        anonymousId,
        url,
        customerDescription,
        status: "llm_failed",
      });

      await sendRunLogEmail({
        ...logBase,
        steps,
        outcome: "llm_failed",
        errorDetail: `Primary: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)} | Fallback: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        durationMs: Date.now() - startTime,
      });

      return NextResponse.json({
        error: "llm_failed",
        message:
          "Something went wrong during analysis. Your use wasn't counted — please try again.",
        usesRemaining: MAX_USES - useCount,
      });
    }
  }

  // 6. Calculate overall score and save
  const overallScore = calculateOverallScore(llmResult.elements);
  steps.push(`Score calculated: ${overallScore}/100`);

  // Generate verification credentials
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  const reportId = await convex.mutation(api.signalReports.saveReport, {
    leadId,
    anonymousId,
    url,
    customerDescription,
    overallScore,
    gruntTest: llmResult.gruntTest,
    elements: llmResult.elements,
    quickWin: llmResult.quickWin,
    strengths: llmResult.strengths,
    fullSummary: llmResult.fullSummary,
    status: "success",
    verifyCode,
    verifyToken,
  });
  steps.push(`Report saved: ${reportId}`);

  // 7. Trigger emails and save form submission (awaited so Vercel doesn't kill the process)
  const emailResults = await Promise.allSettled([
    convex.action(api.emails.sendSignalScoreToVisitor, {
      firstName,
      email,
      url,
      overallScore,
      gruntTestPass: llmResult.gruntTest.pass,
      reportId: reportId as string,
      verifyCode,
      verifyToken,
    }),

    convex.action(api.emails.sendSignalScoreToAdmin, {
      firstName,
      email,
      url,
      customerDescription,
      overallScore,
      elementScores: {
        character: llmResult.elements.character.score,
        problem: llmResult.elements.problem.score,
        guide: llmResult.elements.guide.score,
        plan: llmResult.elements.plan.score,
        cta: llmResult.elements.cta.score,
        stakes: llmResult.elements.stakes.score,
        transformation: llmResult.elements.transformation.score,
      },
    }),

    convex.mutation(api.formSubmissions.submitSignalScore, {
      url,
      customerDescription,
      firstName,
      email,
      score: overallScore,
      reportId: reportId as string,
      anonymousId,
    }),
  ]);

  const emailLabels = ["Visitor email", "Admin email", "Form submission"];
  emailResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      steps.push(`${emailLabels[i]}: sent`);
    } else {
      steps.push(`${emailLabels[i]}: FAILED — ${result.reason}`);
    }
  });

  steps.push(`Model used: ${modelUsed}`);

  await sendRunLogEmail({
    ...logBase,
    steps,
    outcome: "success",
    overallScore,
    durationMs: Date.now() - startTime,
  });

  const newUseCount = useCount + 1;

  return NextResponse.json({
    overallScore,
    gruntTest: llmResult.gruntTest,
    quickWin: llmResult.quickWin,
    reportId,
    usesRemaining: MAX_USES - newUseCount,
  });
}
