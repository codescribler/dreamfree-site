import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import { SECTION_KEYS, SectionKey } from "@/lib/insights-prompt";

export const maxDuration = 10;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MIN_REPORTS = 2;
const MAX_REPORTS = 100;

function isSectionKey(value: unknown): value is SectionKey {
  return (
    typeof value === "string" &&
    (SECTION_KEYS as readonly string[]).includes(value)
  );
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { section, count } = body as { section?: unknown; count?: unknown };

  if (!isSectionKey(section)) {
    return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_REPORTS ||
    count > MAX_REPORTS
  ) {
    return NextResponse.json({ error: "invalid_count" }, { status: 400 });
  }

  let insightId: string;
  try {
    insightId = await convex.mutation(api.signalInsights.enqueueGeneration, {
      section,
      count,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not_enough_reports")) {
      const available = Number(msg.split(":")[1] ?? 0);
      return NextResponse.json(
        { error: "not_enough_reports", available },
        { status: 422 },
      );
    }
    console.error("enqueueGeneration failed", err);
    return NextResponse.json(
      { error: "enqueue_failed", detail: msg },
      { status: 500 },
    );
  }

  return NextResponse.json({ insightId, status: "pending" });
}
