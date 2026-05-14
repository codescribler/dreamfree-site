/**
 * Resend HTTP wrapper for campaign emails. No Convex imports — runs in both
 * the Convex default runtime and Next.js. Owns retry/backoff, the
 * List-Unsubscribe headers, the unsubscribe footer, and Resend tags.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 3;
/** Backoff before attempts 2 and 3. Index 0 unused (no wait before attempt 1). */
const BACKOFF_MS = [0, 1_000, 2_000];

export interface SendCampaignEmailArgs {
  from: string;
  to: string;
  subject: string;
  /** Body HTML without the footer — the footer is appended here. */
  bodyHtml: string;
  /** Body plain text without the footer — the footer is appended here. */
  bodyText: string;
  /** The audited site URL, shown in the footer's "you're getting these because" line. */
  reportUrl: string;
  /** The human-facing unsubscribe page URL (footer link). */
  unsubscribeUrl: string;
  /** The one-click POST endpoint used in the List-Unsubscribe header. */
  listUnsubscribePostUrl: string;
  tags: { enrollmentId: string; draftId: string; role: string };
}

export type SendCampaignEmailResult =
  | { ok: true; resendId: string }
  | { ok: false; error: string };

type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The unsubscribe block appended to every campaign email (HTML). */
export function buildUnsubscribeFooterHtml(
  reportUrl: string,
  unsubscribeUrl: string,
): string {
  return `
<hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
<p style="color:#7b7b96;font-size:13px;">
  You're getting these because you generated a Signal Score for <a href="${reportUrl}">${reportUrl}</a>.
</p>
<p style="color:#7b7b96;font-size:13px;">
  Don't want to hear from me? <a href="${unsubscribeUrl}">Unsubscribe</a> — one click, no questions asked.
</p>`;
}

/** The unsubscribe block appended to every campaign email (plain text). */
export function buildUnsubscribeFooterText(
  reportUrl: string,
  unsubscribeUrl: string,
): string {
  return `

—
You're getting these because you generated a Signal Score for ${reportUrl}.
Don't want to hear from me? Unsubscribe — one click, no questions asked: ${unsubscribeUrl}`;
}

/**
 * Send one campaign email through Resend with up to 3 attempts. `sleep` is
 * injectable so tests run instantly; production callers omit it.
 */
export async function sendCampaignEmail(
  args: SendCampaignEmailArgs,
  sleep: SleepFn = realSleep,
): Promise<SendCampaignEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const html =
    args.bodyHtml +
    buildUnsubscribeFooterHtml(args.reportUrl, args.unsubscribeUrl);
  const text =
    args.bodyText +
    buildUnsubscribeFooterText(args.reportUrl, args.unsubscribeUrl);

  const payload = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${args.listUnsubscribePostUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "enrollmentId", value: args.tags.enrollmentId },
      { name: "draftId", value: args.tags.draftId },
      { name: "role", value: args.tags.role },
    ],
  };

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        if (data.id) return { ok: true, resendId: data.id };
        lastError = "Resend 200 response had no id";
        continue;
      }
      const errText = await res.text().catch(() => "");
      lastError = `Resend HTTP ${res.status} ${errText.slice(0, 200)}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, error: lastError };
}
