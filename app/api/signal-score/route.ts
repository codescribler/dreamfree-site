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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, customerDescription, firstName, email, anonymousId, phone } = body as {
    url: string;
    customerDescription: string;
    firstName: string;
    email: string;
    anonymousId: string;
    phone?: string;
  };

  if (!url || !email || !firstName || !customerDescription || !anonymousId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // 1. Rate limit check
  const useCount = await convex.query(api.signalReports.countUses, {
    anonymousId,
    email,
  });

  if (useCount >= MAX_USES) {
    // Still capture the lead
    const leadId = await convex.mutation(api.leads.upsertLeadPublic, {
      email,
      firstName,
      phone,
      website: url,
      source: "signal_score",
      anonymousId,
    });

    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "rate_limited",
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
  } catch {
    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
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

  if (strippedContent.length < 100) {
    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
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
  try {
    llmResult = await callOpenRouter(OPENROUTER_MODEL_PRIMARY);
  } catch {
    try {
      console.warn("Primary model failed, falling back to Gemini Flash");
      llmResult = await callOpenRouter(OPENROUTER_MODEL_FALLBACK);
    } catch {
      await convex.mutation(api.signalReports.saveFailedReport, {
        leadId,
        anonymousId,
        url,
        customerDescription,
        status: "llm_failed",
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

  // 7. Trigger emails (fire and forget — don't block the response)
  convex
    .action(api.emails.sendSignalScoreToVisitor, {
      firstName,
      email,
      url,
      overallScore,
      gruntTestPass: llmResult.gruntTest.pass,
      reportId: reportId as string,
      verifyCode,
      verifyToken,
    })
    .catch((err) => console.error("Visitor email failed:", err));

  convex
    .action(api.emails.sendSignalScoreToAdmin, {
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
    })
    .catch((err) => console.error("Admin email failed:", err));

  // 8. Also save to formSubmissions for the existing dashboard
  convex
    .mutation(api.formSubmissions.submitSignalScore, {
      url,
      customerDescription,
      firstName,
      email,
      score: overallScore,
      reportId: reportId as string,
      anonymousId,
    })
    .catch((err) => console.error("Form submission failed:", err));

  const newUseCount = useCount + 1;

  return NextResponse.json({
    overallScore,
    gruntTest: llmResult.gruntTest,
    quickWin: llmResult.quickWin,
    reportId,
    usesRemaining: MAX_USES - newUseCount,
  });
}
