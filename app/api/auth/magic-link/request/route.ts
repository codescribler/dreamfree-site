import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const result = await convex.mutation(api.loginTokens.createLoginToken, {
      email: normalised,
      tokenHash,
    });

    if (result.issued) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        new URL(req.url).origin ||
        "https://dreamfree.co.uk";
      const link = `${siteUrl}/api/auth/magic-link/callback?token=${token}`;

      await convex.action(api.emails.sendMagicLinkEmail, {
        email: normalised,
        link,
      });
    }
  } catch (err) {
    console.error("Magic link request failed:", err);
  }

  // Always return the same response to prevent email enumeration.
  return NextResponse.json({ success: true });
}
