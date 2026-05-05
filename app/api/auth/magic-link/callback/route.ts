import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { createSession, sessionCookieOptions } from "@/lib/session";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/sign-in?error=invalid_link", req.url),
    );
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const result = await convex.mutation(api.loginTokens.consumeLoginToken, {
    tokenHash,
  });

  if (!result) {
    return NextResponse.redirect(
      new URL("/sign-in?error=expired_link", req.url),
    );
  }

  const sessionToken = await createSession({
    email: result.email,
    isAdmin: result.isAdmin,
  });

  const response = NextResponse.redirect(new URL("/dashboard", req.url));
  response.cookies.set(sessionCookieOptions(sessionToken));
  return response;
}
