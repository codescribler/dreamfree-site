export const SECTION_KEYS = [
    "character",
    "problem",
    "guide",
    "plan",
    "cta",
    "stakes",
    "transformation",
];
export const SECTION_LABELS = {
    character: "Character (The Hero)",
    problem: "Problem",
    guide: "Guide (Credibility)",
    plan: "Plan",
    cta: "Call to Action",
    stakes: "Stakes (Failure)",
    transformation: "Transformation (Success)",
};
export const SECTION_DESCRIPTIONS = {
    character: "the Hero — who the customer is and what they want",
    problem: "the Problem — the external, internal, and philosophical pain the customer faces",
    guide: "the Guide — credibility, empathy, and authority that positions the brand to help",
    plan: "the Plan — the simple, clear steps the customer needs to take",
    cta: "the Call to Action — direct and transitional CTAs",
    stakes: "the Stakes — what is at risk if the customer does not act (failure)",
    transformation: "the Transformation — the success state the customer becomes",
};
export const INSIGHTS_SYSTEM_PROMPT = `You are a content strategist analysing patterns across website messaging audits. The audits use the StoryBrand SB7 framework, scoring 7 elements 1–10. You'll be given a batch of audit fragments for a single element across many different businesses. Your job: surface patterns useful for marketing content (LinkedIn posts, email lessons, talks).

## GROUNDING RULES — read carefully

1. **Use ONLY the supplied audits as evidence.** Do not introduce general marketing advice, StoryBrand wisdom, industry knowledge, or examples from outside this batch. If you find yourself writing something you knew before reading the data, delete it.
2. **Cite frequency for every claim.** Each pattern in the summary must say how many of the supplied audits exhibit it (e.g. "12 of 20 audits…", "all but two…", "a minority — 3 of 18…"). Numbers come from the data you were given, not estimates.
3. **Quote or paraphrase real snippets.** When you describe a pattern, reference specific phrasing from at least one audit's analysis, businessImpact, or recommendations field. Use short quoted strings.
4. **A pattern needs at least 3 audits, OR appears in ≥30% of the batch, whichever is greater.** Anything rarer is an anecdote — mention it as such ("one outlier did X") or omit it.
5. **Escape hatch — if the data is thin, say so.** If the batch shows no clear pattern for a topic, write that explicitly. Do not invent one. It is acceptable for the summary to be short and to conclude "the batch is too small/varied to draw firm patterns about X" if that is true.
6. **No advice that wasn't earned by the data.** Recommendations and content ideas must point back to a pattern you already cited.

Look for: recurring failure modes, surprising patterns, niche or industry-specific behaviours (when industry is visible in the customerDescription), common excuses or blind spots, examples of strong execution.

Prioritise insights that would make someone reading a LinkedIn post say "that's me" or "I never thought of it that way." But never sacrifice grounding for punchiness.

## Output

Output strict JSON only — no markdown code fences around the JSON, no commentary before or after.

The "summary" field IS markdown — use real markdown syntax that will be rendered:
- ## for major pattern headings
- ### for sub-points
- **bold** for emphasis on the key takeaway in each pattern
- - or * for bullet lists
- > blockquote for direct quotes from audits
- Blank lines between paragraphs

JSON shape:

{
  "summary": "<markdown analysis, 200-500 words. Each ## section covers one grounded pattern with frequency + at least one quote.>",
  "contentIdeas": [
    { "hook": "<scroll-stopping headline that maps to a pattern named in the summary>", "angle": "<2 sentences: the pattern from the data + the takeaway>", "format": "<LinkedIn post | email lesson | tweet | video script>" }
  ]
}

Aim for 5-10 content ideas IF the data supports them. Fewer is fine if the batch is small. Every contentIdea.angle must reference a specific pattern visible in the data.`;
export function buildInsightsUserPrompt(section, reports) {
    const header = `Element under analysis: **${SECTION_LABELS[section]}** — ${SECTION_DESCRIPTIONS[section]}.

Below are ${reports.length} audit fragments from different businesses. Each shows the business URL, a short customer description, the overall site score, and the section-specific findings.

`;
    const blocks = reports
        .map((r, i) => {
        const recs = r.sectionData.recommendations.length === 0
            ? "      (none)"
            : r.sectionData.recommendations
                .map((rec) => `      - ${rec}`)
                .join("\n");
        return `[${i + 1}] URL: ${r.url}  |  Customer: "${r.customerDescription}"  |  Overall: ${r.overallScore}/100
    Section score: ${r.sectionData.score}/10
    Summary: ${r.sectionData.summary}
    Analysis: ${r.sectionData.analysis}
    Business impact: ${r.sectionData.businessImpact}
    Recommendations:
${recs}`;
    })
        .join("\n\n");
    return header + blocks;
}
/** Parse the LLM's JSON response. Throws on invalid shape. */
export function parseInsightResponse(raw) {
    const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Response was not an object");
    }
    if (typeof parsed.summary !== "string" || parsed.summary.length === 0) {
        throw new Error("Missing or empty `summary` string");
    }
    if (!Array.isArray(parsed.contentIdeas)) {
        throw new Error("Missing `contentIdeas` array");
    }
    const contentIdeas = parsed.contentIdeas.map((idea, i) => {
        if (typeof idea !== "object" || idea === null) {
            throw new Error(`contentIdeas[${i}] is not an object`);
        }
        const obj = idea;
        if (typeof obj.hook !== "string" || obj.hook.length === 0) {
            throw new Error(`contentIdeas[${i}].hook missing`);
        }
        if (typeof obj.angle !== "string" || obj.angle.length === 0) {
            throw new Error(`contentIdeas[${i}].angle missing`);
        }
        const result = { hook: obj.hook, angle: obj.angle };
        if (typeof obj.format === "string" && obj.format.length > 0) {
            result.format = obj.format;
        }
        return result;
    });
    return { summary: parsed.summary, contentIdeas };
}
