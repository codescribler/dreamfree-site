import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { verifySession } from "@/lib/session";
import { stripHtml } from "@/lib/html-stripper";
import { randomInt, randomBytes } from "crypto";

export const maxDuration = 30;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifySession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const reportId = id as Id<"signalReports">;

  // Load the rate_limited report
  const original = await convex.query(api.signalReports.getById, { reportId });
  if (!original) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }
  if (original.status !== "rate_limited") {
    return NextResponse.json(
      {
        error: "not_rate_limited",
        message: `Report status is "${original.status}". Re-run is only supported for rate_limited reports.`,
      },
      { status: 400 },
    );
  }

  // Load the lead for email/firstName/phone/anonymousId
  const lead = await convex.query(api.leads.getById, {
    leadId: original.leadId,
  });
  if (!lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  // Clear rate-limited entries for this lead (resets countUses)
  const removed = await convex.mutation(
    api.signalReports.clearRateLimitedForLead,
    { leadId: original.leadId },
  );

  // Fetch the website HTML
  let rawHtml: string;
  try {
    const siteUrl = original.url.startsWith("http")
      ? original.url
      : `https://${original.url}`;
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
  } catch (err) {
    return NextResponse.json(
      {
        error: "fetch_failed",
        message: `Couldn't reach ${original.url}: ${err instanceof Error ? err.message : String(err)}`,
        clearedCount: removed,
      },
      { status: 502 },
    );
  }

  const strippedContent = stripHtml(rawHtml);
  if (strippedContent.length < 100) {
    return NextResponse.json(
      {
        error: "fetch_failed",
        message: `Only ${strippedContent.length} chars of content extracted from ${original.url}`,
        clearedCount: removed,
      },
      { status: 502 },
    );
  }

  // Generate fresh verify credentials and enqueue
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  // Pick the lead's anonymousId from their array (most recent first), or
  // fall back to the original report's anonymousId.
  const anonymousId =
    lead.anonymousIds[lead.anonymousIds.length - 1] ?? original.anonymousId;

  const newReportId = await convex.mutation(api.signalReports.enqueueReport, {
    leadId: original.leadId,
    anonymousId,
    url: original.url,
    customerDescription: original.customerDescription,
    strippedContent,
    firstName: lead.firstName ?? lead.name ?? "",
    email: lead.email,
    phone: lead.phone,
    verifyCode,
    verifyToken,
  });

  return NextResponse.json({
    newReportId,
    clearedCount: removed,
  });
}
