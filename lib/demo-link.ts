/**
 * Append `df-notrack=1` to a deployed-demo URL so Daniel's own admin clicks
 * from the dashboard don't pollute prospect engagement analytics.
 *
 * Used everywhere a demo URL is rendered inside `/dashboard/*`. Prospect-
 * facing links (the ones sent in outbound emails by the demo-builder or
 * the API caller) MUST NOT use this helper — those clicks are the signal.
 *
 * When the demo-analytics endpoint is built (see
 * docs/demo-requests-api.md > "Future: demo-side analytics"), the analytics
 * script on each demo site should short-circuit and not POST anything when
 * `df-notrack=1` is present in the URL.
 *
 * Idempotent: a URL that already has the flag is returned unchanged.
 * Handles existing query strings and fragments correctly.
 */
export function withNoTrack(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("df-notrack", "1");
    return u.toString();
  } catch {
    // Bare strings, mailto:, javascript:, etc — fall back to a manual append
    // so we still emit *something* clickable. Caller's responsibility to
    // pass real http(s) URLs; the deploy API validates this.
    if (url.includes("df-notrack=")) return url;
    const sep = url.includes("?") ? "&" : "?";
    const [path, hash = ""] = url.split("#");
    return `${path}${sep}df-notrack=1${hash ? `#${hash}` : ""}`;
  }
}
