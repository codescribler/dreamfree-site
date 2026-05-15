import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { fetchAndStripSite } from "@/lib/site-fetch";
import { randomInt, randomBytes } from "crypto";

export const maxDuration = 30;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Public retry for a failed Signal Report. Accepts the report ID as a weak
 * access token (same model as the report view page). Refuses anything that's
 * not a "real" failure (fetch_failed / llm_failed); rate_limited has its own
 * flow, and success/pending must not be re-run from here.
 *
 * On retry success: creates a fresh pending report with the same lead, URL,
 * customer description, and (optionally) a different URL passed as ?url=...
 * On retry failure (still can't fetch): records a new failed report so the
 * failure tracking + admin notification fire again.
 *
 * Returns a 303 redirect to /report/<newId> on either outcome so a plain
 * HTML form POST works without JS.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reportId = id as Id<"signalReports">;

  const original = await convex.query(api.signalReports.getById, { reportId });
  if (!original) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }
  if (original.status !== "fetch_failed" && original.status !== "llm_failed") {
    return NextResponse.json(
      {
        error: "not_retryable",
        message: `Report status is "${original.status}". Retry is only supported for fetch_failed or llm_failed.`,
      },
      { status: 400 },
    );
  }

  const lead = await convex.query(api.leads.getById, {
    leadId: original.leadId,
  });
  if (!lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  // Allow the caller to retry with a different URL (e.g. "did you mean
  // www.acme.test?"). Defaults to the original.
  const urlOverride = new URL(req.url).searchParams.get("url");
  const retryUrl =
    urlOverride && urlOverride.trim().length > 0
      ? urlOverride.trim()
      : original.url;

  const anonymousId =
    lead.anonymousIds[lead.anonymousIds.length - 1] ?? original.anonymousId;

  const fetchResult = await fetchAndStripSite(retryUrl);

  // Fetch failed again → record a new fetch_failed report (so tracking +
  // notification fire) and bounce them to the new report's failure page.
  if (!fetchResult.ok) {
    const newReportId = await convex.mutation(
      api.signalReports.saveFailedReport,
      {
        leadId: original.leadId,
        anonymousId,
        url: retryUrl,
        customerDescription: original.customerDescription,
        status: "fetch_failed",
        error: fetchResult.detail,
      },
    );
    return NextResponse.redirect(
      new URL(`/report/${newReportId}`, req.url),
      303,
    );
  }

  // Site fetched cleanly → enqueue a fresh pending report. Generation will
  // run async; the new report page renders the live-updating pending UI.
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  const newReportId = await convex.mutation(api.signalReports.enqueueReport, {
    leadId: original.leadId,
    anonymousId,
    url: retryUrl,
    customerDescription: original.customerDescription,
    strippedContent: fetchResult.strippedContent,
    firstName: lead.firstName ?? lead.name ?? "",
    email: lead.email,
    phone: lead.phone,
    verifyCode,
    verifyToken,
  });

  return NextResponse.redirect(
    new URL(`/report/${newReportId}`, req.url),
    303,
  );
}
