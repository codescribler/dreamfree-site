import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { setVerificationCookie } from "@/lib/report-cookie";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** GET: verify via magic link token and redirect to the report page */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL(`/report/${id}`, req.url));
  }

  let report;
  try {
    report = await convex.query(api.signalReports.getById, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.redirect(new URL(`/report/${id}`, req.url));
  }

  // Reject: missing report, unusable status (only fetch/llm-failed have empty token), or mismatched token.
  // Note: pending reports are accepted — API-created reports include the token in their viewUrl
  // before the LLM completes, and the prospect should still be marked verified so they see the
  // full report when generation finishes.
  if (
    !report ||
    !report.verifyToken ||
    report.status === "fetch_failed" ||
    report.status === "llm_failed" ||
    report.verifyToken !== token
  ) {
    return NextResponse.redirect(new URL(`/report/${id}`, req.url));
  }

  // Mark as verified in Convex if still public
  if (report.accessLevel === "public") {
    await convex.mutation(api.signalReports.markVerified, {
      reportId: id as Id<"signalReports">,
    });
  }

  // Record engagement for API-created reports. The mutation is a no-op for
  // inbound reports; we always call it (rather than gating client-side on
  // createdViaApiKeyId) so the source of truth lives server-side.
  try {
    await convex.mutation(api.signalReports.recordEngagement, {
      reportId: id as Id<"signalReports">,
    });
  } catch (err) {
    // Never block the verify redirect on engagement bookkeeping.
    console.error("recordEngagement failed", err);
  }

  // Set verification cookie (allowed in Route Handler)
  const response = NextResponse.redirect(new URL(`/report/${id}`, req.url));
  await setVerificationCookie(id, response);

  return response;
}

/** POST: verify via 6-digit code */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { code } = body as { code: string };

  if (!code || code.length !== 6) {
    return NextResponse.json(
      { error: "invalid_code", message: "Please enter a 6-digit code." },
      { status: 400 },
    );
  }

  let report;
  try {
    report = await convex.query(api.signalReports.getById, {
      reportId: id as Id<"signalReports">,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!report || report.status !== "success") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (report.verifyCode !== code) {
    return NextResponse.json(
      {
        error: "wrong_code",
        message: "That code doesn't match. Check your email and try again.",
      },
      { status: 403 },
    );
  }

  // Mark as verified in Convex if still public
  if (report.accessLevel === "public") {
    await convex.mutation(api.signalReports.markVerified, {
      reportId: id as Id<"signalReports">,
    });
  }

  // Set verification cookie
  await setVerificationCookie(id);

  return NextResponse.json({ success: true });
}
