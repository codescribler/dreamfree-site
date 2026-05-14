import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Token comes from ?t=; fall back to a form body for odd one-click clients. */
async function extractToken(req: NextRequest): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get("t");
  if (fromQuery) return fromQuery;
  try {
    const form = await req.formData();
    const t = form.get("t");
    return typeof t === "string" && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = await extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  try {
    await convex.mutation(api.emailCampaignsInbound.processUnsubscribe, {
      token,
    });
  } catch (err) {
    console.error("processUnsubscribe (one-click) failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  // RFC 8058: a 200 is all the mail client needs.
  return NextResponse.json({ ok: true });
}
