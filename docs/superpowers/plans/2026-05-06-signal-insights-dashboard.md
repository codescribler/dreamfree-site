# Signal Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/dashboard/insights` page showing the all-time average score for each of the 7 SB7 sections, plus per-section AI-generated insight panels with history and a generate-from-latest-N control.

**Architecture:** New Next.js page under the existing `/dashboard` route (already protected by middleware). Reads averages from a new Convex query against `signalReports`; reads/writes insights from a new `signalInsights` table via a new Convex module. Generation happens through a new POST API route that pulls the latest N reports, calls OpenRouter (same primary/fallback as `/api/signal-score`), and stores the result.

**Tech Stack:** Next.js 16 App Router, Convex, OpenRouter (via `fetch`), Tailwind, React 19. No test framework in this project — verification is `npm run lint`, TypeScript check (`npx tsc --noEmit`), `npm run build`, and manual browser checks.

**Spec:** `docs/superpowers/specs/2026-05-06-signal-insights-dashboard-design.md`

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `convex/signalInsights.ts` | All queries/mutations for the new `signalInsights` table; query that pulls latest N reports projected to one section |
| `lib/insights-prompt.ts` | Section labels, descriptions, system prompt, user prompt builder, JSON-shape parser |
| `app/api/dashboard/insights/generate/route.ts` | POST handler — admin auth, fetch latest N reports, call OpenRouter w/ fallback, save insight |
| `app/dashboard/DashboardNav.tsx` | Client sub-nav strip rendered inside `app/dashboard/layout.tsx` |
| `app/dashboard/insights/page.tsx` | Server page: averages table + 7 section panels |
| `app/dashboard/insights/AveragesTable.tsx` | Server component rendering the table |
| `app/dashboard/insights/SectionInsightsPanel.tsx` | Client component: subscribes to insights for one section, renders history left, generate controls right |

**Edited files**

| Path | Change |
|---|---|
| `convex/schema.ts` | Add `signalInsights` table |
| `convex/signalReports.ts` | Add `averagesBySection` query |
| `app/dashboard/layout.tsx` | Render `<DashboardNav />` below the header |

---

## Task 1: Add `signalInsights` table to schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the new table definition**

Open `convex/schema.ts`. After the existing `signalReports` block (ends around line 174 with `.index("by_status", ["status"])`) and before the `contentPlans` block, add:

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
    reportCount: v.number(),
    reportsAnalysed: v.array(v.id("signalReports")),
    summary: v.string(),
    contentIdeas: v.array(
      v.object({
        hook: v.string(),
        angle: v.string(),
        format: v.optional(v.string()),
      }),
    ),
    modelUsed: v.string(),
    createdAt: v.number(),
  }).index("by_section_and_createdAt", ["section", "createdAt"]),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Push schema to Convex dev**

Run: `npx convex dev --once`
Expected: schema deploys without errors and `convex/_generated/dataModel.d.ts` updates to include `signalInsights`.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(convex): add signalInsights table for per-section AI analysis"
```

---

## Task 2: Add `averagesBySection` query to signalReports

**Files:**
- Modify: `convex/signalReports.ts`

- [ ] **Step 1: Add the query**

Open `convex/signalReports.ts`. At the bottom of the file (after the `addShareToken` mutation), add:

```ts
const SECTION_KEYS = [
  "character",
  "problem",
  "guide",
  "plan",
  "cta",
  "stakes",
  "transformation",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

/** All-time averages for each SB7 section across successful reports. */
export const averagesBySection = query({
  args: {},
  handler: async (ctx) => {
    const successful = await ctx.db
      .query("signalReports")
      .withIndex("by_status", (q) => q.eq("status", "success"))
      .collect();

    const totals: Record<SectionKey, { sum: number; count: number }> = {
      character: { sum: 0, count: 0 },
      problem: { sum: 0, count: 0 },
      guide: { sum: 0, count: 0 },
      plan: { sum: 0, count: 0 },
      cta: { sum: 0, count: 0 },
      stakes: { sum: 0, count: 0 },
      transformation: { sum: 0, count: 0 },
    };

    for (const report of successful) {
      for (const key of SECTION_KEYS) {
        const score = report.elements[key]?.score;
        if (typeof score === "number") {
          totals[key].sum += score;
          totals[key].count += 1;
        }
      }
    }

    const sections = {} as Record<
      SectionKey,
      { average: number; count: number }
    >;
    for (const key of SECTION_KEYS) {
      const { sum, count } = totals[key];
      sections[key] = {
        average: count === 0 ? 0 : sum / count,
        count,
      };
    }

    return {
      counts: { successful: successful.length },
      sections,
    };
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Push to Convex dev**

Run: `npx convex dev --once`
Expected: deploys, `convex/_generated/api.d.ts` includes `averagesBySection`.

- [ ] **Step 4: Manually smoke-test the query**

Open the Convex dashboard, run `signalReports:averagesBySection` with `{}`. Expected: returns `{ counts, sections }` with all 7 keys, each having `average` and `count` numbers. Compare two of the section counts against the row count of successful reports — they should be equal.

- [ ] **Step 5: Commit**

```bash
git add convex/signalReports.ts convex/_generated
git commit -m "feat(convex): add averagesBySection query"
```

---

## Task 3: Add `signalInsights` Convex module

**Files:**
- Create: `convex/signalInsights.ts`

- [ ] **Step 1: Create the module**

Write `convex/signalInsights.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const sectionValidator = v.union(
  v.literal("character"),
  v.literal("problem"),
  v.literal("guide"),
  v.literal("plan"),
  v.literal("cta"),
  v.literal("stakes"),
  v.literal("transformation"),
);

/** All insights for a section, newest first. */
export const listBySection = query({
  args: { section: sectionValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signalInsights")
      .withIndex("by_section_and_createdAt", (q) =>
        q.eq("section", args.section),
      )
      .order("desc")
      .collect();
  },
});

/** Latest N successful reports projected to one section. */
export const latestReportsForSection = query({
  args: {
    section: sectionValidator,
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.count, 100));
    const reports = await ctx.db
      .query("signalReports")
      .withIndex("by_status", (q) => q.eq("status", "success"))
      .order("desc")
      .take(limit);

    return reports.map((report) => ({
      _id: report._id,
      url: report.url,
      customerDescription: report.customerDescription,
      overallScore: report.overallScore,
      sectionData: report.elements[args.section],
    }));
  },
});

/** Insert a new insight row. */
export const insertInsight = mutation({
  args: {
    section: sectionValidator,
    reportCount: v.number(),
    reportsAnalysed: v.array(v.id("signalReports")),
    summary: v.string(),
    contentIdeas: v.array(
      v.object({
        hook: v.string(),
        angle: v.string(),
        format: v.optional(v.string()),
      }),
    ),
    modelUsed: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalInsights", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Type-check + push**

Run: `npx tsc --noEmit && npx convex dev --once`
Expected: PASS, deploy succeeds, `convex/_generated/api.d.ts` exposes `signalInsights.listBySection`, `signalInsights.latestReportsForSection`, `signalInsights.insertInsight`.

- [ ] **Step 3: Commit**

```bash
git add convex/signalInsights.ts convex/_generated
git commit -m "feat(convex): add signalInsights module"
```

---

## Task 4: Add the prompt-building library

**Files:**
- Create: `lib/insights-prompt.ts`

- [ ] **Step 1: Write the file**

```ts
export const SECTION_KEYS = [
  "character",
  "problem",
  "guide",
  "plan",
  "cta",
  "stakes",
  "transformation",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  character: "Character (The Hero)",
  problem: "Problem",
  guide: "Guide (Credibility)",
  plan: "Plan",
  cta: "Call to Action",
  stakes: "Stakes (Failure)",
  transformation: "Transformation (Success)",
};

export const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  character: "the Hero — who the customer is and what they want",
  problem:
    "the Problem — the external, internal, and philosophical pain the customer faces",
  guide:
    "the Guide — credibility, empathy, and authority that positions the brand to help",
  plan: "the Plan — the simple, clear steps the customer needs to take",
  cta: "the Call to Action — direct and transitional CTAs",
  stakes:
    "the Stakes — what is at risk if the customer does not act (failure)",
  transformation:
    "the Transformation — the success state the customer becomes",
};

export const INSIGHTS_SYSTEM_PROMPT = `You are a content strategist analysing patterns across website messaging audits. The audits use the StoryBrand SB7 framework, scoring 7 elements 1–10. You'll be given a batch of audit fragments for a single element across many different businesses. Your job: surface patterns useful for marketing content (LinkedIn posts, email lessons, talks).

Look for: recurring failure modes, surprising patterns, niche or industry-specific behaviours, common excuses or blind spots, examples of strong execution. Prioritise insights that would make someone reading a LinkedIn post say "that's me" or "I never thought of it that way."

Be specific. Avoid generic advice ("websites should be clear"). Quote or paraphrase real patterns from the data.

Output strict JSON only — no markdown code fences, no commentary before or after:

{
  "summary": "<markdown analysis, 200-400 words, with ## subheadings for each major pattern>",
  "contentIdeas": [
    { "hook": "<scroll-stopping headline>", "angle": "<2 sentences on what to write and why it works>", "format": "<LinkedIn post | email lesson | tweet | video script>" }
  ]
}

Aim for 5-10 content ideas, varied in format.`;

export interface ReportFragment {
  url: string;
  customerDescription: string;
  overallScore: number;
  sectionData: {
    score: number;
    summary: string;
    analysis: string;
    businessImpact: string;
    recommendations: string[];
  };
}

export function buildInsightsUserPrompt(
  section: SectionKey,
  reports: ReportFragment[],
): string {
  const header = `Element under analysis: **${SECTION_LABELS[section]}** — ${SECTION_DESCRIPTIONS[section]}.

Below are ${reports.length} audit fragments from different businesses. Each shows the business URL, a short customer description, the overall site score, and the section-specific findings.

`;

  const blocks = reports
    .map((r, i) => {
      const recs =
        r.sectionData.recommendations.length === 0
          ? "  (none)"
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

export interface ContentIdea {
  hook: string;
  angle: string;
  format?: string;
}

export interface ParsedInsight {
  summary: string;
  contentIdeas: ContentIdea[];
}

/** Parse the LLM's JSON response. Throws on invalid shape. */
export function parseInsightResponse(raw: string): ParsedInsight {
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

  const contentIdeas: ContentIdea[] = parsed.contentIdeas.map(
    (idea: unknown, i: number) => {
      if (typeof idea !== "object" || idea === null) {
        throw new Error(`contentIdeas[${i}] is not an object`);
      }
      const obj = idea as Record<string, unknown>;
      if (typeof obj.hook !== "string" || obj.hook.length === 0) {
        throw new Error(`contentIdeas[${i}].hook missing`);
      }
      if (typeof obj.angle !== "string" || obj.angle.length === 0) {
        throw new Error(`contentIdeas[${i}].angle missing`);
      }
      const result: ContentIdea = { hook: obj.hook, angle: obj.angle };
      if (typeof obj.format === "string" && obj.format.length > 0) {
        result.format = obj.format;
      }
      return result;
    },
  );

  return { summary: parsed.summary, contentIdeas };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/insights-prompt.ts
git commit -m "feat: add insights prompt builder and JSON parser"
```

---

## Task 5: Add the generate API route

**Files:**
- Create: `app/api/dashboard/insights/generate/route.ts`

- [ ] **Step 1: Inspect the existing OpenRouter call pattern**

Open `app/api/signal-score/route.ts` and find the `callOpenRouter` helper around line 294. The new route follows the same shape (primary + fallback model, same auth header, same headers).

Also note the model constant import — `OPENROUTER_MODEL_PRIMARY` and `OPENROUTER_MODEL_FALLBACK` come from `@/lib/signal-prompt`.

- [ ] **Step 2: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import {
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "@/lib/signal-prompt";
import {
  SECTION_KEYS,
  SectionKey,
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  ReportFragment,
} from "@/lib/insights-prompt";

export const maxDuration = 60;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const MIN_REPORTS = 2;
const MAX_REPORTS = 100;

function isSectionKey(value: unknown): value is SectionKey {
  return (
    typeof value === "string" &&
    (SECTION_KEYS as readonly string[]).includes(value)
  );
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://dreamfree.co.uk",
        "X-OpenRouter-Title": "Dreamfree Signal Insights",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("Empty response from OpenRouter");
  }
  return content;
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { section, count } = body as { section?: unknown; count?: unknown };

  if (!isSectionKey(section)) {
    return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_REPORTS ||
    count > MAX_REPORTS
  ) {
    return NextResponse.json({ error: "invalid_count" }, { status: 400 });
  }

  const reports = await convex.query(
    api.signalInsights.latestReportsForSection,
    { section, count },
  );

  if (reports.length < MIN_REPORTS) {
    return NextResponse.json(
      { error: "not_enough_reports", available: reports.length },
      { status: 422 },
    );
  }

  const fragments: ReportFragment[] = reports.map((r) => ({
    url: r.url,
    customerDescription: r.customerDescription,
    overallScore: r.overallScore,
    sectionData: r.sectionData,
  }));

  const userPrompt = buildInsightsUserPrompt(section, fragments);

  let raw: string;
  let modelUsed = OPENROUTER_MODEL_PRIMARY;
  try {
    raw = await callOpenRouter(
      OPENROUTER_MODEL_PRIMARY,
      INSIGHTS_SYSTEM_PROMPT,
      userPrompt,
    );
  } catch (primaryErr) {
    try {
      modelUsed = OPENROUTER_MODEL_FALLBACK;
      raw = await callOpenRouter(
        OPENROUTER_MODEL_FALLBACK,
        INSIGHTS_SYSTEM_PROMPT,
        userPrompt,
      );
    } catch (fallbackErr) {
      console.error("Insights generation failed", {
        primary: primaryErr,
        fallback: fallbackErr,
      });
      return NextResponse.json(
        { error: "llm_failed" },
        { status: 502 },
      );
    }
  }

  let parsed;
  try {
    parsed = parseInsightResponse(raw);
  } catch (err) {
    console.error("Invalid LLM response", err, raw.slice(0, 500));
    return NextResponse.json(
      { error: "invalid_llm_response" },
      { status: 502 },
    );
  }

  const insightId = await convex.mutation(
    api.signalInsights.insertInsight,
    {
      section,
      reportCount: reports.length,
      reportsAnalysed: reports.map((r) => r._id),
      summary: parsed.summary,
      contentIdeas: parsed.contentIdeas,
      modelUsed,
    },
  );

  return NextResponse.json({
    insightId,
    reportCount: reports.length,
  });
}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard/insights/generate/route.ts
git commit -m "feat(api): add /api/dashboard/insights/generate route"
```

---

## Task 6: Add the dashboard sub-nav

**Files:**
- Create: `app/dashboard/DashboardNav.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create the nav component**

Write `app/dashboard/DashboardNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/insights", label: "Insights" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-mb-px border-b-2 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-teal text-teal"
                  : "border-transparent text-muted hover:text-charcoal"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Render it in the layout**

Open `app/dashboard/layout.tsx`. Replace its body with:

```tsx
import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DashboardNav } from "./DashboardNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-warm-grey">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-charcoal"
            >
              Dreamfree
            </Link>
            <span className="rounded-md bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">
              Dashboard
            </span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <DashboardNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run: `npm run dev` (background or separate terminal). Visit `http://localhost:3000/dashboard`. Expected: Leads tab is highlighted teal, Insights tab is muted; clicking Insights navigates (will 404 until Task 7 — that's OK for now). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/DashboardNav.tsx app/dashboard/layout.tsx
git commit -m "feat(dashboard): add sub-nav strip with Leads/Insights links"
```

---

## Task 7: Add the averages table

**Files:**
- Create: `app/dashboard/insights/AveragesTable.tsx`

- [ ] **Step 1: Write the table component**

```tsx
import { SECTION_KEYS, SECTION_LABELS, SectionKey } from "@/lib/insights-prompt";

interface AveragesTableProps {
  data: {
    counts: { successful: number };
    sections: Record<SectionKey, { average: number; count: number }>;
  };
}

export function AveragesTable({ data }: AveragesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-warm-grey/50">
              <th className="px-4 py-3 font-semibold text-charcoal">Section</th>
              <th className="px-4 py-3 font-semibold text-charcoal">Average</th>
              <th className="px-4 py-3 font-semibold text-charcoal">Reports</th>
            </tr>
          </thead>
          <tbody>
            {SECTION_KEYS.map((key) => {
              const { average, count } = data.sections[key];
              return (
                <tr
                  key={key}
                  className="border-b border-border last:border-b-0 hover:bg-warm-grey/30"
                >
                  <td className="px-4 py-3">
                    <a
                      href={`#section-${key}`}
                      className="font-medium text-charcoal hover:text-teal hover:underline"
                    >
                      {SECTION_LABELS[key]}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-charcoal">
                    {count === 0 ? "—" : `${average.toFixed(1)} / 10`}
                  </td>
                  <td className="px-4 py-3 text-muted">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/insights/AveragesTable.tsx
git commit -m "feat(dashboard): add averages table component"
```

---

## Task 8: Add the per-section insights panel (client component)

**Files:**
- Create: `app/dashboard/insights/SectionInsightsPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { SECTION_LABELS, SectionKey } from "@/lib/insights-prompt";

interface SectionInsightsPanelProps {
  section: SectionKey;
  reportsAvailable: number;
}

const MIN = 2;
const MAX = 100;
const DEFAULT_COUNT = 20;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SectionInsightsPanel({
  section,
  reportsAvailable,
}: SectionInsightsPanelProps) {
  const insights = useQuery(api.signalInsights.listBySection, { section });
  const [count, setCount] = useState<number>(
    Math.min(DEFAULT_COUNT, Math.max(MIN, reportsAvailable)),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = reportsAvailable >= MIN;
  const latest = insights?.[0];
  const older = insights?.slice(1) ?? [];

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, count }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Convex subscription will refresh the list automatically.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section
      id={`section-${section}`}
      className="scroll-mt-24 rounded-xl border border-border bg-white p-6"
    >
      <h2 className="mb-4 text-lg font-bold text-charcoal">
        {SECTION_LABELS[section]}
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {/* Insights history (left, 2/3) */}
        <div className="md:col-span-2">
          {insights === undefined ? (
            <p className="text-sm text-muted">Loading insights…</p>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted">
              No insights yet. Set a count and click Generate.
            </p>
          ) : (
            <div className="space-y-4">
              {latest && <InsightView insight={latest} expanded />}
              {older.map((i) => (
                <InsightView key={i._id} insight={i} expanded={false} />
              ))}
            </div>
          )}
        </div>

        {/* Generate controls (right, 1/3) */}
        <aside className="space-y-3 rounded-lg border border-border bg-warm-grey/40 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Reports to analyse
          </label>
          <input
            type="number"
            min={MIN}
            max={MAX}
            value={count}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCount(
                Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : MIN,
              );
            }}
            disabled={!canGenerate || isGenerating}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-muted">
            {reportsAvailable} successful report{reportsAvailable === 1 ? "" : "s"}{" "}
            available
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="w-full rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
            title={
              !canGenerate
                ? `Need at least ${MIN} reports for this section`
                : undefined
            }
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          {latest && (
            <p className="text-xs text-muted">
              Last run: {formatDate(latest.createdAt)} · N={latest.reportCount}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function InsightView({
  insight,
  expanded,
}: {
  insight: Doc<"signalInsights">;
  expanded: boolean;
}) {
  const summaryLine = `${formatDate(insight.createdAt)} · N=${insight.reportCount}`;

  const body = (
    <>
      <p className="mb-2 text-xs text-muted">
        Model: {insight.modelUsed}
      </p>
      <div className="prose prose-sm mb-4 max-w-none whitespace-pre-wrap text-charcoal">
        {insight.summary}
      </div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-deep">
        Content ideas
      </h4>
      <ul className="space-y-3">
        {insight.contentIdeas.map((idea, i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-warm-grey/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-charcoal">
                {idea.hook}
              </p>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${idea.hook}\n\n${idea.angle}`,
                  )
                }
                className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-muted hover:text-charcoal"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-sm text-slate">{idea.angle}</p>
            {idea.format && (
              <p className="mt-1 text-xs text-muted">Format: {idea.format}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );

  if (expanded) {
    return (
      <div className="rounded-lg border border-border bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Latest · {summaryLine}
        </p>
        {body}
      </div>
    );
  }

  return (
    <details className="group rounded-lg border border-border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-charcoal">
        {summaryLine}
      </summary>
      <div className="mt-3">{body}</div>
    </details>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/insights/SectionInsightsPanel.tsx
git commit -m "feat(dashboard): add per-section insights panel"
```

---

## Task 9: Add the insights page

**Files:**
- Create: `app/dashboard/insights/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { SECTION_KEYS } from "@/lib/insights-prompt";
import { AveragesTable } from "./AveragesTable";
import { SectionInsightsPanel } from "./SectionInsightsPanel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const averages = await convex.query(api.signalReports.averagesBySection, {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Signal Insights</h1>
        <p className="mt-1 text-sm text-muted">
          All-time averages across {averages.counts.successful} successful
          reports, plus AI pattern analysis for each section.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-bold text-charcoal">
          Section averages
        </h2>
        <AveragesTable data={averages} />
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-bold text-charcoal">Section insights</h2>
        {SECTION_KEYS.map((section) => (
          <SectionInsightsPanel
            key={section}
            section={section}
            reportsAvailable={averages.sections[section].count}
          />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds; the `/dashboard/insights` route appears in the Next.js output.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/insights/page.tsx
git commit -m "feat(dashboard): add insights page with averages and section panels"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Wait for "Ready" message.

- [ ] **Step 2: Sign in to the dashboard**

Open `http://localhost:3000/dashboard` in a browser and sign in as admin if not already.

- [ ] **Step 3: Navigate to Insights**

Click the **Insights** tab in the sub-nav. Expected:
- Page loads without errors.
- Averages table shows 7 rows with realistic averages and counts.
- Each section name is a link that scrolls to its panel.
- Each section panel shows "No insights yet…" empty state on the left, generate controls on the right.
- For sections with fewer than 2 successful reports, the Generate button is disabled and tooltip explains why.

- [ ] **Step 4: Generate an insight**

Pick a section with plenty of reports. Set the count to a small number (e.g. 3 or 5) to keep latency low and confirm the round-trip. Click **Generate**. Expected:
- Button shows "Generating…" and disables.
- After ~10–30 seconds, the new insight appears in the left column with markdown summary and a list of content ideas. "Last run" line populates on the right.

- [ ] **Step 5: Generate again**

Click Generate a second time on the same section. Expected: new run appears expanded at the top, previous one collapses below as `<details>`.

- [ ] **Step 6: Copy a content idea**

Click **Copy** next to any content idea. Paste into a text field. Expected: hook + angle copied to clipboard.

- [ ] **Step 7: Error path**

Open DevTools → Network → throttle to "Offline" → click Generate. Expected: red error message appears under the button. Restore network.

- [ ] **Step 8: Stop dev server, final commit**

If all checks passed, no code changes needed — work is already committed. If issues surfaced, fix them and commit each fix separately.

```bash
# only if any final tweaks
git add -A
git commit -m "fix(dashboard): <describe>"
```

---

## Self-Review Notes

**Spec coverage:** All sections of the spec are covered:
- Architecture & routing → Tasks 5, 6, 9
- Data model → Tasks 1, 3
- UI layout → Tasks 7, 8, 9
- Generation flow → Task 5
- Prompt → Task 4
- Error handling → Task 5 (server) and Task 8 (client)

**Type consistency:** `SectionKey` type is defined once in `lib/insights-prompt.ts` and reused by the API route, the page, the panel, and the averages table. The Convex schema uses `v.union(v.literal(...))` for the same set of strings — kept aligned by hand.

**Placeholders:** None.
