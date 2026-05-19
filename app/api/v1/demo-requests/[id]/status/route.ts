import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type Status = Doc<"demoRequests">["status"];

const ALL_STATUSES: Status[] = [
  "requested",
  "in_progress",
  "demo_complete",
  "notification_sent",
  "customer_reviewed",
  "followed_up",
  "won",
  "lost",
];

/**
 * POST /api/v1/demo-requests/{id}/status
 *
 * Body: `{ "status": Status }` where Status is one of the values listed in
 * docs/demo-requests-api.md. Stamps the new status + bumps `updatedAt`.
 * Permits any-to-any transitions; the demo-builder is trusted to keep
 * the lifecycle moving in the right direction.
 *
 * Response: `{ ok: true }` on success, 400 on bad status, 404 on bad id.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const status = (body as { status?: unknown })?.status;
  if (typeof status !== "string" || !ALL_STATUSES.includes(status as Status)) {
    return NextResponse.json(
      {
        error: "invalid status",
        validStatuses: ALL_STATUSES,
      },
      { status: 400 },
    );
  }

  try {
    await convex.mutation(api.demoRequests.updateStatus, {
      requestId: id as Id<"demoRequests">,
      status: status as Status,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "failed to update status";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, key: { name: auth.name } });
}
