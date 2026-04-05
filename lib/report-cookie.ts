import { cookies } from "next/headers";
import { createHmac } from "crypto";
import type { NextResponse } from "next/server";

const SECRET = process.env.REPORT_SIGNING_SECRET || "dev-secret-change-me";

function sign(reportId: string): string {
  const payload = JSON.stringify({ reportId, ts: Date.now() });
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function verify(token: string, reportId: string): boolean {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return false;
  try {
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const expected = createHmac("sha256", SECRET)
      .update(payload)
      .digest("base64url");
    if (signature !== expected) return false;
    const data = JSON.parse(payload);
    return data.reportId === reportId;
  } catch {
    return false;
  }
}

const COOKIE_PREFIX = "df_report_";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365, // 1 year
};

/** Set cookie via cookies() — only works in Server Actions / Route Handlers (POST) */
export async function setVerificationCookie(reportId: string): Promise<void>;
/** Set cookie on a NextResponse — works in any Route Handler */
export async function setVerificationCookie(reportId: string, response: NextResponse): Promise<void>;
export async function setVerificationCookie(reportId: string, response?: NextResponse): Promise<void> {
  const name = `${COOKIE_PREFIX}${reportId}`;
  const value = sign(reportId);
  const opts = { ...COOKIE_OPTIONS, path: `/report/${reportId}` };

  if (response) {
    response.cookies.set(name, value, opts);
  } else {
    const cookieStore = await cookies();
    cookieStore.set(name, value, opts);
  }
}

export async function hasVerificationCookie(
  reportId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(`${COOKIE_PREFIX}${reportId}`);
  if (!cookie) return false;
  return verify(cookie.value, reportId);
}
