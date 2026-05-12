import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;

  let result;
  try {
    result = await convex.query(api.signalReports.getApiResponse, {
      reportId: id as Id<"signalReports">,
      siteUrl: SITE_URL,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
