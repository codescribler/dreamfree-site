/**
 * Extract meaningful text content from raw HTML.
 * Strips scripts, styles, nav, footer, and returns clean text
 * with structural hints (headings, links, alt text) preserved.
 * Targets ~3000 tokens of useful content.
 */
export function stripHtml(html: string): string {
  let content = html;

  // Remove entire blocks we don't want
  const blockTags = [
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "video",
    "audio",
  ];
  for (const tag of blockTags) {
    content = content.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      "",
    );
  }

  // Remove nav and footer (often boilerplate)
  content = content.replace(/<(nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Extract alt text from images before removing tags
  const altTexts: string[] = [];
  const altRegex = /alt=["']([^"']+)["']/gi;
  let altMatch;
  while ((altMatch = altRegex.exec(content)) !== null) {
    if (altMatch[1].trim()) {
      altTexts.push(`[Image: ${altMatch[1].trim()}]`);
    }
  }

  // Extract href text from links for CTA analysis
  const ctaTexts: string[] = [];
  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    const linkText = linkMatch[1].replace(/<[^>]+>/g, "").trim();
    if (linkText && linkText.length > 1 && linkText.length < 100) {
      ctaTexts.push(`[Link: ${linkText}]`);
    }
  }

  // Preserve heading structure
  content = content.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, level, text) => {
      const clean = text.replace(/<[^>]+>/g, "").trim();
      return clean ? `\n[H${level}] ${clean}\n` : "";
    },
  );

  // Preserve button text
  content = content.replace(
    /<button[^>]*>([\s\S]*?)<\/button>/gi,
    (_m, text) => {
      const clean = text.replace(/<[^>]+>/g, "").trim();
      return clean ? `[Button: ${clean}]` : "";
    },
  );

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  content = content
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Collapse whitespace
  content = content.replace(/\s+/g, " ").trim();

  // Append extracted alt texts and CTAs
  if (altTexts.length > 0) {
    content += "\n\n--- Image Alt Texts ---\n" + altTexts.join("\n");
  }
  if (ctaTexts.length > 0) {
    content +=
      "\n\n--- Links & CTAs ---\n" + [...new Set(ctaTexts)].join("\n");
  }

  // Truncate to roughly 3000 tokens (~12000 chars)
  if (content.length > 12000) {
    content = content.slice(0, 12000) + "\n\n[Content truncated]";
  }

  return content;
}
