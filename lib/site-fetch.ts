import { stripHtml } from "@/lib/html-stripper";

const FETCH_TIMEOUT_MS = 10000;
const MIN_CONTENT_CHARS = 100;

export type FetchSiteResult =
  | { ok: true; strippedContent: string; rawHtmlLength: number }
  | { ok: false; reason: "fetch_failed"; detail: string };

/**
 * Fetch a website's HTML, strip it to meaningful text, and validate length.
 * Used by the public Signal Score form path and the outbound API path.
 *
 * Always returns — never throws.
 */
export async function fetchAndStripSite(url: string): Promise<FetchSiteResult> {
  const siteUrl = url.startsWith("http") ? url : `https://${url}`;

  let rawHtml: string;
  try {
    const response = await fetch(siteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DreamfreeBot/1.0; +https://dreamfree.co.uk)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: "fetch_failed",
        detail: `HTTP ${response.status}`,
      };
    }
    rawHtml = await response.text();
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const strippedContent = stripHtml(rawHtml);
  if (strippedContent.length < MIN_CONTENT_CHARS) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: `Only ${strippedContent.length} chars of content extracted`,
    };
  }
  return { ok: true, strippedContent, rawHtmlLength: rawHtml.length };
}
