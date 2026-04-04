import { cookies } from "next/headers";
import { createHmac } from "crypto";

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

export async function setVerificationCookie(reportId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(`${COOKIE_PREFIX}${reportId}`, sign(reportId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/report/${reportId}`,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function hasVerificationCookie(
  reportId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(`${COOKIE_PREFIX}${reportId}`);
  if (!cookie) return false;
  return verify(cookie.value, reportId);
}
