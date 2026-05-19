import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
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

function parseStatusList(input: string | null): Status[] | null {
  if (!input) return null;
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const valid = new Set<Status>(ALL_STATUSES);
  const bad = parts.find((p) => !valid.has(p as Status));
  if (bad) {
    throw new Error(`unknown status: ${bad}`);
  }
  return parts as Status[];
}

function parseInt32(input: string | null): number | null {
  if (input == null) return null;
  const n = Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/**
 * GET /api/v1/demo-requests
 *
 * Query params (all optional):
 *   - `status` — comma-separated list (e.g. `requested,in_progress`)
 *   - `since`  — epoch millis; only return rows with `updatedAt >= since`
 *   - `limit`  — 1..500, default 100
 *
 * Returns: `{ key: { name }, demoRequests: Doc<"demoRequests">[] }`
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  let statuses: Status[] | null;
  try {
    statuses = parseStatusList(req.nextUrl.searchParams.get("status"));
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }
  const since = parseInt32(req.nextUrl.searchParams.get("since"));
  const limit = parseInt32(req.nextUrl.searchParams.get("limit")) ?? undefined;

  const demoRequests = await convex.query(api.demoRequests.listForApi, {
    status: statuses ?? undefined,
    since: since ?? undefined,
    limit,
  });

  return NextResponse.json({
    key: { name: auth.name },
    demoRequests,
  });
}
