import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  let token: string | undefined;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token;
  } catch {
    token = undefined;
  }
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  try {
    const result = await convex.mutation(
      api.emailCampaignsInbound.undoUnsubscribe,
      { token },
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("undoUnsubscribe failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
