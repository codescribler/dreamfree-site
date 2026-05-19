import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/v1/demo-requests/{id}/deploy
 *
 * Body: `{ "demoUrl": "https://example.com/demos/<token>" }`
 *
 * Stamps `demoUrl` + `demoDeployedAt` and advances `status` to
 * `demo_complete` (the "Ready" column on the dashboard board) if the
 * card is currently in `requested` or `in_progress`. Later statuses
 * are never downgraded — e.g. re-deploying a card already in `won`
 * just refreshes the URL without rewinding the lifecycle.
 *
 * Response: `{ ok: true }` on success.
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
  const demoUrl = (body as { demoUrl?: unknown })?.demoUrl;
  if (typeof demoUrl !== "string" || demoUrl.length === 0) {
    return NextResponse.json(
      { error: "missing demoUrl (string)" },
      { status: 400 },
    );
  }

  // Cheap sanity check — anything that doesn't look like an http(s) URL is
  // almost certainly a caller bug.
  if (!/^https?:\/\//i.test(demoUrl)) {
    return NextResponse.json(
      { error: "demoUrl must start with http:// or https://" },
      { status: 400 },
    );
  }

  try {
    await convex.mutation(api.demoRequests.markDeployed, {
      requestId: id as Id<"demoRequests">,
      demoUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "failed to mark deployed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, key: { name: auth.name } });
}
