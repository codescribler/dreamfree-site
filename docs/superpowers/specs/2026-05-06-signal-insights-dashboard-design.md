# Signal Insights Dashboard — Design Spec

**Date:** 2026-05-06
**Status:** Approved, pending implementation plan

## Goal

Add an admin-only dashboard page that surfaces aggregate intelligence from all the Signal Score reports run against the site. Daniel will use the output to fuel social media posts, email lessons, and other content — turning the signal scoring tool into a content engine.

The page does two things:

1. **Show the all-time average score for each of the 7 Signal Method (SB7) report sections** in a table.
2. **Generate and store AI-written insights per section.** Daniel chooses how many of the latest reports to analyse, hits Generate, and the LLM finds patterns across that batch — saved as history so older runs can be revisited and compared.

## Non-goals

- No filtering by date / niche / score range yet (all-time only)
- No CSV export, no charts — just numbers and text
- No auto-regeneration on a schedule
- No editing/curating of stored insights — they're append-only history

## Architecture

### Routing

| Path | Type | Purpose |
|---|---|---|
| `/dashboard/insights` | Next.js page (server component) | New insights page |
| `/api/dashboard/insights/generate` | Next.js route handler (POST) | Generate-and-save endpoint |

Existing `middleware.ts` already protects `/dashboard/:path*` with admin auth — both the page and the API route inherit that. The API route additionally calls `verifySession()` for defence-in-depth.

### Layout change

`app/dashboard/layout.tsx` gets a sub-nav strip below the header:

- **Leads** (`/dashboard`)
- **Insights** (`/dashboard/insights`)

Active link highlighted by reading `usePathname()` (the layout becomes a client component, or we extract a small `<DashboardNav />` client component to keep the layout server-rendered — preferred).

### Convex modules

- `convex/signalInsights.ts` — new file, all queries/mutations for the new table
- `convex/signalReports.ts` — add a single new query `averagesBySection`

Splitting into a new file (rather than bloating `signalReports.ts`) keeps each module focused.

## Data Model

New table in `convex/schema.ts`:

```ts
signalInsights: defineTable({
  section: v.union(
    v.literal("character"),
    v.literal("problem"),
    v.literal("guide"),
    v.literal("plan"),
    v.literal("cta"),
    v.literal("stakes"),
    v.literal("transformation"),
  ),
  reportCount: v.number(),                              // X chosen at generation time
  reportsAnalysed: v.array(v.id("signalReports")),      // exact reports used
  summary: v.string(),                                   // markdown analysis from the LLM
  contentIdeas: v.array(
    v.object({
      hook: v.string(),
      angle: v.string(),
      format: v.optional(v.string()),
    })
  ),
  modelUsed: v.string(),
  createdAt: v.number(),
})
  .index("by_section_and_createdAt", ["section", "createdAt"]),
```

Averages are computed on demand via a Convex query — no separate table needed.

### Convex API

**`convex/signalReports.ts`**

- `averagesBySection` — query, no args. Returns:
  ```ts
  {
    counts: { successful: number },
    sections: Record<
      "character" | "problem" | "guide" | "plan" | "cta" | "stakes" | "transformation",
      { average: number; count: number }
    >,
  }
  ```
  Implementation: query `signalReports` `by_status` index where `status = "success"`, sum each element's score, divide. `count` may equal `counts.successful` for now (every successful report has all 7 elements), but is per-section to remain robust.

**`convex/signalInsights.ts`**

- `listBySection(section)` — query. Returns `signalInsights` rows for that section, ordered by `createdAt` desc.
- `latestReportsForSection(section, count)` — query. Returns the latest `count` successful `signalReports`, projected to `{ _id, url, customerDescription, overallScore, sectionData: elements[section] }`. Used by the generate route.
- `insertInsight(...)` — mutation. Inserts a new row.

## UI Layout

### Page structure (`app/dashboard/insights/page.tsx`)

```
┌────────────────────────────────────────────────────┐
│  Section averages (all-time, success only)         │
│  ┌──────────────────────────────────────────────┐  │
│  │ Section       │ Average │ Reports             │  │
│  ├──────────────────────────────────────────────┤  │
│  │ Character     │ 6.4/10  │ 142                 │  │
│  │ Problem       │ 5.8/10  │ 142                 │  │
│  │ Guide         │ …       │ …                   │  │
│  │ Plan          │         │                     │  │
│  │ CTA           │         │                     │  │
│  │ Stakes        │         │                     │  │
│  │ Transformation│         │                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Each section name links to #section-{key} below.  │
│                                                    │
│  ── Character ───────────────────────────────────  │
│  ┌────────────────────────────┬─────────────────┐  │
│  │ Latest insight (expanded)  │ Reports to      │  │
│  │ Generated 6 May, N=20      │ analyse: [ 20 ] │  │
│  │ ── markdown summary ──     │                 │  │
│  │ Content ideas:             │ [ Generate ]    │  │
│  │ • hook — angle — format    │                 │  │
│  │   [copy]                   │ Last run:       │  │
│  │ • …                        │ 6 May, N=20     │  │
│  │                            │                 │  │
│  │ ▸ 12 Apr, N=10 (collapsed) │                 │  │
│  │ ▸ 28 Mar, N=5  (collapsed) │                 │  │
│  └────────────────────────────┴─────────────────┘  │
│  ── Problem ───────────────────────────────────    │
│  …                                                  │
└────────────────────────────────────────────────────┘
```

- The page is a server component for the averages query (initial render).
- Each section panel is a client component (`<SectionInsightsPanel section="character" />`) that subscribes to `signalInsights.listBySection` via `useQuery` so newly generated insights appear without a refresh.
- Left column ~2/3 width, right column ~1/3 width on desktop. Stacks on mobile.
- Latest run rendered open. Older runs are `<details>` collapsed; summary line shows `formattedDate · N=count`.
- Empty state: "No insights yet. Set a count and click Generate."
- Each `contentIdea` row has a small "copy" button that copies `${hook}\n\n${angle}` to the clipboard.
- Number input: default `20`, min `2`, max `100`. Disabled (with tooltip "Need at least 2 reports for this section") when section's report count < 2.
- Generate button shows a spinner + disables while the request is in flight.

## Generation Flow

`POST /api/dashboard/insights/generate` body: `{ section: SectionKey, count: number }`

1. Call `verifySession()`. If not admin, return 401.
2. Validate `section` (one of 7) and `count` (integer 2–100). Return 400 on failure.
3. `convex.query(api.signalInsights.latestReportsForSection, { section, count })` — gets up to `count` successful reports' relevant fields.
4. If fewer than 2 returned, respond 422 with `{ error: "not_enough_reports", available }`.
5. Build prompt (see below).
6. Call OpenRouter with `OPENROUTER_MODEL_PRIMARY`; on error fall back to `OPENROUTER_MODEL_FALLBACK` (mirrors `/api/signal-score`).
7. Strip ``` fences, `JSON.parse`. Validate shape: `summary` string, `contentIdeas` array of `{ hook, angle, format? }`. On invalid: respond 502.
8. `convex.mutation(api.signalInsights.insertInsight, { section, reportCount: actualCount, reportsAnalysed: [...ids], summary, contentIdeas, modelUsed })`.
9. Return `{ insightId, reportCount: actualCount }`.

Vercel timeout: `export const maxDuration = 60`.

## The Prompt

A small constant table on the server:

```ts
const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  character: "the Hero — who the customer is and what they want",
  problem: "the Problem — the external, internal, and philosophical pain the customer faces",
  guide: "the Guide — credibility, empathy, and authority that positions the brand to help",
  plan: "the Plan — the simple, clear steps the customer needs to take",
  cta: "the Call to Action — direct and transitional CTAs",
  stakes: "the Stakes — what's at risk if the customer doesn't act (failure)",
  transformation: "the Transformation — the success state the customer becomes",
};

const SECTION_LABELS: Record<SectionKey, string> = {
  character: "Character (The Hero)",
  problem: "Problem",
  guide: "Guide (Credibility)",
  plan: "Plan",
  cta: "Call to Action",
  stakes: "Stakes (Failure)",
  transformation: "Transformation (Success)",
};
```

### System prompt

> You are a content strategist analysing patterns across website messaging audits. The audits use the StoryBrand SB7 framework, scoring 7 elements 1–10. You'll be given a batch of audit fragments for a single element across many different businesses. Your job: surface patterns useful for marketing content (LinkedIn posts, email lessons, talks).
>
> Look for: recurring failure modes, surprising patterns, niche or industry-specific behaviours, common excuses or blind spots, examples of strong execution. Prioritise insights that would make someone reading a LinkedIn post say "that's me" or "I never thought of it that way."
>
> Be specific. Avoid generic advice ("websites should be clear"). Quote or paraphrase real patterns from the data.
>
> Output strict JSON only — no markdown code fences, no commentary before or after:
>
> ```
> {
>   "summary": "<markdown analysis, 200–400 words, with ## subheadings for each major pattern>",
>   "contentIdeas": [
>     { "hook": "<scroll-stopping headline>", "angle": "<2 sentences on what to write and why it works>", "format": "<LinkedIn post | email lesson | tweet | video script>" }
>   ]
> }
> ```
>
> Aim for 5–10 content ideas, varied in format.

### User prompt template

> Element under analysis: **{SECTION_LABELS[section]}** — {SECTION_DESCRIPTIONS[section]}.
>
> Below are {N} audit fragments from different businesses. Each shows the business URL, a short customer description, the overall site score, and the section-specific findings.
>
> ```
> [1] URL: {url}  |  Customer: "{customerDescription}"  |  Overall: {overallScore}/100
>     Section score: {sectionData.score}/10
>     Summary: {sectionData.summary}
>     Analysis: {sectionData.analysis}
>     Business impact: {sectionData.businessImpact}
>     Recommendations:
>       - {recommendation 1}
>       - {recommendation 2}
>       …
>
> [2] URL: …
> ```

## Error Handling & Edge Cases

| Case | Behaviour |
|---|---|
| Fewer than `count` successful reports exist | Use however many are available; the inserted row's `reportCount` reflects the actual count |
| Section has zero or one successful reports | Generate disabled; tooltip explains "Need at least 2 reports" |
| OpenRouter primary model errors | Fall back to secondary model |
| Both models error | 502; UI shows inline "Generation failed, try again"; nothing inserted |
| LLM returns invalid JSON | Treated same as model failure |
| Concurrent generates on same section | Permitted; each click creates a new history row |
| Generation duration > 30s | Allowed; route uses `maxDuration = 60` |

## File Changes Summary

**New files**
- `app/dashboard/insights/page.tsx`
- `app/dashboard/insights/SectionInsightsPanel.tsx` (client component)
- `app/dashboard/insights/AveragesTable.tsx` (server-rendered table)
- `app/dashboard/DashboardNav.tsx` (client sub-nav)
- `app/api/dashboard/insights/generate/route.ts`
- `convex/signalInsights.ts`
- `lib/insights-prompt.ts` (system + user template + section maps)

**Edited files**
- `convex/schema.ts` — add `signalInsights` table
- `convex/signalReports.ts` — add `averagesBySection` query
- `app/dashboard/layout.tsx` — render `<DashboardNav />`

## Open Risks

- LLM JSON reliability: the existing signal-score path also asks for JSON and copes; same defensive parsing pattern applies here.
- Cost: each generation hits OpenRouter; default `count` of 20 keeps prompts modest.
- All-time averages will drift slowly as more reports come in; that's fine for v1.
