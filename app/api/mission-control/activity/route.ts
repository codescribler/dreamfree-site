import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function extractKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, token] = auth.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey;
  return null;
}

function parseSince(input: string | null): number | null {
  if (!input) return null;
  const numeric = Number(input);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

export async function GET(req: NextRequest) {
  const rawKey = extractKey(req);
  if (!rawKey) {
    return NextResponse.json(
      { error: "Missing API key. Send Authorization: Bearer <key>." },
      { status: 401 },
    );
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const verified = await convex.mutation(api.apiKeys.verifyAndTouch, {
    keyHash,
  });

  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or revoked API key." },
      { status: 401 },
    );
  }

  const sinceParam = parseSince(req.nextUrl.searchParams.get("since"));
  const untilParam = parseSince(req.nextUrl.searchParams.get("until"));

  const until = untilParam ?? verified.now;
  const since = sinceParam ?? verified.previousLastCalledAt ?? 0;

  if (since > until) {
    return NextResponse.json(
      { error: "`since` must be earlier than `until`." },
      { status: 400 },
    );
  }

  const activity = await convex.query(api.missionControl.getActivity, {
    since,
    until,
  });

  return NextResponse.json({
    key: { name: verified.name },
    ...activity,
  });
}
