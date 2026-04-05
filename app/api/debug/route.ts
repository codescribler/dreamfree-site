import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check env vars exist (values redacted)
  const envChecks = [
    "NEXT_PUBLIC_CONVEX_URL",
    "OPENROUTER_API_KEY",
    "REPORT_SIGNING_SECRET",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "RESEND_API_KEY",
  ];

  results.envVars = Object.fromEntries(
    envChecks.map((key) => {
      const val = process.env[key];
      if (!val) return [key, "MISSING"];
      return [key, `SET (${val.length} chars, starts: ${val.slice(0, 6)}...)`];
    }),
  );

  // 2. Test Convex connection
  try {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
    const convex = new ConvexHttpClient(url);
    // Just test the connection with a simple query
    await convex.query("signalReports:countUses" as never, {
      anonymousId: "__debug__",
      email: "__debug__",
    } as never);
    results.convex = "OK";
  } catch (err) {
    results.convex = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 3. Test OpenRouter connection
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY not set");
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.openRouter = "OK";
  } catch (err) {
    results.openRouter = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 4. Check crypto (for randomInt/randomBytes)
  try {
    const { randomInt, randomBytes } = await import("crypto");
    const code = String(randomInt(100000, 999999));
    const token = randomBytes(32).toString("base64url");
    results.crypto = `OK (sample code: ${code}, token length: ${token.length})`;
  } catch (err) {
    results.crypto = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
