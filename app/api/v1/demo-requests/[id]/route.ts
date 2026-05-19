import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/v1/demo-requests/{id}
 *
 * Returns the demo request, the linked lead, and (if applicable) the
 * originating Signal Report document. The Signal Report carries the full
 * audit content (overallScore, elements, quickWin, strengths, fullSummary)
 * which the demo-builder typically wants verbatim.
 *
 * Response: `{ demoRequest, lead, signalReport | null }` or 404 if not found.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;
  let result;
  try {
    result = await convex.query(api.demoRequests.getApiDetail, {
      requestId: id as Id<"demoRequests">,
    });
  } catch {
    return NextResponse.json(
      { error: "invalid demo request id" },
      { status: 400 },
    );
  }
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ key: { name: auth.name }, ...result });
}
