import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { randomInt, randomBytes } from "crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";
import { fetchAndStripSite } from "@/lib/site-fetch";

export const maxDuration = 30; // covers the 25s long-poll plus overhead

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";

interface CreateBody {
  url?: string;
  customerDescription?: string;
  firstName?: string;
  email?: string;
  phone?: string;
  wait?: boolean;
}

const REQUIRED_FIELDS: (keyof CreateBody)[] = [
  "url",
  "customerDescription",
  "firstName",
  "email",
];

function buildViewUrl(
  reportId: Id<"signalReports">,
  verifyToken: string,
): string {
  return `${SITE_URL}/report/${reportId}?token=${encodeURIComponent(verifyToken)}`;
}

function buildPollUrl(reportId: Id<"signalReports">): string {
  return `${SITE_URL}/api/v1/signal-reports/${reportId}`;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  // 2. Body + validation
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const missing = REQUIRED_FIELDS.filter((f) => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "missing_fields", fields: missing },
      { status: 400 },
    );
  }

  const url = body.url!;
  const customerDescription = body.customerDescription!;
  const firstName = body.firstName!;
  const email = body.email!;
  const phone = body.phone;
  const wait = body.wait === true;

  // 3. Upsert outbound lead
  const leadId = await convex.mutation(api.leads.upsertOutboundLeadPublic, {
    email,
    firstName,
    phone,
    website: url,
  });

  // 4. Fetch + strip site
  const fetchResult = await fetchAndStripSite(url);
  if (!fetchResult.ok) {
    const failedReportId = await convex.mutation(
      api.signalReports.saveFailedApiReport,
      {
        leadId,
        apiKeyId: auth.keyId,
        url,
        customerDescription,
        status: "fetch_failed",
      },
    );
    // No viewUrl — failed reports have no verifyToken, so no shareable link is possible.
    // The reportId is returned so the caller can correlate with the dashboard.
    return NextResponse.json(
      {
        error: "fetch_failed",
        detail: fetchResult.detail,
        reportId: failedReportId,
      },
      { status: 502 },
    );
  }

  // 5. Generate verify creds + enqueue
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  const reportId = await convex.mutation(
    api.signalReports.enqueueReportFromApi,
    {
      leadId,
      apiKeyId: auth.keyId,
      url,
      customerDescription,
      strippedContent: fetchResult.strippedContent,
      firstName,
      email,
      phone,
      verifyCode,
      verifyToken,
    },
  );

  const viewUrl = buildViewUrl(reportId, verifyToken);
  const pollUrl = buildPollUrl(reportId);

  // 6. Optional long-poll
  if (wait) {
    const result = await pollUntilReady(reportId, viewUrl);
    return NextResponse.json(result);
  }

  return NextResponse.json({
    reportId,
    status: "pending",
    viewUrl,
    pollUrl,
  });
}

const FIRST_POLL_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 25000;

async function pollUntilReady(
  reportId: Id<"signalReports">,
  viewUrl: string,
) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, FIRST_POLL_DELAY_MS));

  while (Date.now() - start < MAX_WAIT_MS) {
    const r = await convex.query(api.signalReports.getApiResponse, {
      reportId,
      siteUrl: SITE_URL,
    });
    if (r && r.status !== "pending") {
      return { ...r, pollUrl: buildPollUrl(reportId) };
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }

  return {
    reportId,
    status: "pending",
    viewUrl,
    pollUrl: buildPollUrl(reportId),
  };
}
