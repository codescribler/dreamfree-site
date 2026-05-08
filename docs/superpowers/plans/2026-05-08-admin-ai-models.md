# Admin AI Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI model selection runtime-editable per use-case via an admin UI, and add a replay tester that runs candidate models against real historic prompts so they can be evaluated before adoption.

**Architecture:** A Convex `aiModelConfig` table stores per-use-case primary+fallback model slugs; a `resolveModels(ctx, useCase)` helper reads it with a chained fallback (use-case row → "default" row → hardcoded constants). Existing AI actions are minimally edited to call the resolver instead of reading constants directly. A second action `runReplay` reproduces the exact production prompt for a given historic record, calls a candidate (and optionally a comparison) model in parallel, captures latency / token usage / cost, and persists the run for review. Admin UI lives at `/dashboard/admin/models`, gated by the existing `isAdmin` middleware.

**Tech Stack:** Next.js 15 (App Router), Convex (queries/mutations/actions/scheduled jobs), TypeScript, OpenRouter (single LLM provider).

**Spec:** `docs/superpowers/specs/2026-05-08-admin-ai-models-design.md`

---

## Project conventions

This codebase has **no test framework configured**. Verification per task uses:
- **Pure helpers (resolver, cost calc, validators):** a `scripts/check-<name>.ts` runnable with `npx tsx`, asserting behaviour via thrown errors.
- **Convex queries/mutations/actions:** `npx convex dev` running locally, then call via the Convex dashboard's Functions tab or via curl using a temporary HTTP endpoint where needed; the plan specifies which.
- **UI:** `npm run dev`, hit the page in a browser, verify visible behaviour.
- **Always:** `npm run lint` and `npm run build` must pass before commit.

Do **not** introduce vitest / jest / playwright in this plan. If a future feature warrants it, that's a separate decision.

## Branching

This feature must reach production before `email-campaigns-plan-2` merges. All work happens on a fresh branch off `master`.

```bash
git fetch origin
git checkout -b admin-models-config origin/master
git cherry-pick 92f60b0  # the design spec commit, currently sat on email-campaigns-plan-2
```

If the spec commit hash differs at execution time, locate it with `git log --all --oneline -- docs/superpowers/specs/2026-05-08-admin-ai-models-design.md`.

## File structure

**New files**

```
convex/
  aiModels.ts             # config CRUD, resolveModels, listReplayableRecords
  aiModelReplay.ts        # runReplay action + helpers
  aiModelPricing.ts       # daily pricing fetch + lookup
  crons.ts                # ADD or extend — schedules pricing refresh + replay cleanup
lib/ai/
  use-cases.ts            # UseCase string union + helpers
  openrouter-metered.ts   # OpenRouter call that returns content + latency + usage + raw
  cost.ts                 # estimateCostGbp helper
lib/ai/prompts/
  content-ideas.ts        # extracted from app/api/content-ideas/route.ts
app/dashboard/admin/
  layout.tsx              # admin sub-area layout (re-uses outer dashboard layout)
app/dashboard/admin/models/
  layout.tsx              # tabs: Config / Replay
  page.tsx                # config table (server component shell)
  ConfigClient.tsx        # client component — editable rows
  replay/page.tsx         # replay form (server component shell)
  replay/ReplayClient.tsx # client component — picker, form, result panel
scripts/
  check-resolve-models.ts # smoke test for resolveModels resolution order
  check-cost.ts           # smoke test for estimateCostGbp
```

**Modified files**

```
convex/schema.ts                       # +aiModelConfig +aiModelReplays +aiModelPricing
convex/signalReportsAction.ts          # use resolveModels
convex/signalInsightsAction.ts         # use resolveModels
convex/emailCampaignsAction.ts         # use resolveModels (both call sites)
app/api/content-ideas/route.ts         # use resolveModels + extracted prompt builders
app/dashboard/DashboardNav.tsx         # +Admin link
```

The existing hardcoded constants in `lib/signal-prompt.ts` (`OPENROUTER_MODEL_PRIMARY`, `OPENROUTER_MODEL_FALLBACK`) and in `convex/emailCampaignsAction.ts` (`MODEL_PRIMARY`, `MODEL_FALLBACK`) **stay**. They become the ultimate fallback inside `resolveModels`.

---

## Task 1: Branch + cherry-pick spec

**Files:**
- None edited; branch creation only.

- [ ] **Step 1: Create branch off master and bring the spec across**

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
git checkout -b admin-models-config
SPEC_COMMIT=$(git log --all --oneline -- docs/superpowers/specs/2026-05-08-admin-ai-models-design.md | head -1 | awk '{print $1}')
git cherry-pick "$SPEC_COMMIT"
```

- [ ] **Step 2: Verify the spec is present**

```bash
test -f docs/superpowers/specs/2026-05-08-admin-ai-models-design.md && echo OK
```

Expected: prints `OK`.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin admin-models-config
```

---

## Task 2: Add schema tables

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the three new tables**

Add the following inside the `defineSchema({...})` object in `convex/schema.ts`, after the last existing table:

```ts
  aiModelConfig: defineTable({
    useCase: v.string(),
    primary: v.string(),
    fallback: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_useCase", ["useCase"]),

  aiModelPricing: defineTable({
    model: v.string(),
    promptUsdPerMillion: v.number(),
    completionUsdPerMillion: v.number(),
    fetchedAt: v.number(),
  }).index("by_model", ["model"]),

  aiModelReplays: defineTable({
    useCase: v.string(),
    recordId: v.string(),
    candidateModel: v.string(),
    compareModel: v.optional(v.string()),
    results: v.array(
      v.object({
        model: v.string(),
        output: v.string(),
        latencyMs: v.number(),
        promptTokens: v.optional(v.number()),
        completionTokens: v.optional(v.number()),
        costGbp: v.optional(v.number()),
        valid: v.boolean(),
        validationError: v.optional(v.string()),
        rawResponse: v.optional(v.any()),
      }),
    ),
    runBy: v.string(),
    runAt: v.number(),
  }).index("by_runAt", ["runAt"]),
```

- [ ] **Step 2: Push the schema to the dev deployment**

```bash
npx convex dev --once
```

Expected: completes without errors. The new tables appear in the Convex dashboard (Data tab).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(admin-models): add aiModelConfig, aiModelPricing, aiModelReplays tables"
```

---

## Task 3: Use-case constants

**Files:**
- Create: `lib/ai/use-cases.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/ai/use-cases.ts

export const USE_CASES = [
  "default",
  "signal_reports",
  "signal_insights",
  "email_drafts",
  "content_ideas",
] as const;

export type UseCase = (typeof USE_CASES)[number];

export const REPLAYABLE_USE_CASES: UseCase[] = [
  "signal_reports",
  "signal_insights",
  "email_drafts",
  "content_ideas",
];

export const USE_CASE_LABELS: Record<UseCase, string> = {
  default: "Default (used when use-case isn't configured)",
  signal_reports: "Signal Reports",
  signal_insights: "Signal Insights",
  email_drafts: "Email Drafts",
  content_ideas: "Content Ideas",
};

export function isUseCase(value: string): value is UseCase {
  return (USE_CASES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Lint passes**

```bash
npm run lint -- lib/ai/use-cases.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/use-cases.ts
git commit -m "feat(admin-models): add UseCase enum and helpers"
```

---

## Task 4: resolveModels helper + config CRUD

**Files:**
- Create: `convex/aiModels.ts`
- Create: `scripts/check-resolve-models.ts`

- [ ] **Step 1: Write `convex/aiModels.ts`**

```ts
// convex/aiModels.ts
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { USE_CASES, type UseCase } from "../lib/ai/use-cases";
import {
  OPENROUTER_MODEL_PRIMARY,
  OPENROUTER_MODEL_FALLBACK,
} from "../lib/signal-prompt";

/**
 * Resolves the primary+fallback OpenRouter model slugs for a given use case.
 * Order: explicit row → "default" row → hardcoded constants in lib/signal-prompt.ts.
 */
export async function resolveModels(
  ctx: QueryCtx,
  useCase: UseCase,
): Promise<{ primary: string; fallback: string }> {
  const explicit = await ctx.db
    .query("aiModelConfig")
    .withIndex("by_useCase", (q) => q.eq("useCase", useCase))
    .unique();
  if (explicit) {
    return { primary: explicit.primary, fallback: explicit.fallback };
  }

  if (useCase !== "default") {
    const fallthrough = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", "default"))
      .unique();
    if (fallthrough) {
      return {
        primary: fallthrough.primary,
        fallback: fallthrough.fallback,
      };
    }
  }

  return {
    primary: OPENROUTER_MODEL_PRIMARY,
    fallback: OPENROUTER_MODEL_FALLBACK,
  };
}

export const listConfig = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("aiModelConfig").collect();
    return USE_CASES.map((useCase) => {
      const row = rows.find((r) => r.useCase === useCase);
      return {
        useCase,
        primary: row?.primary ?? null,
        fallback: row?.fallback ?? null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  },
});

export const setConfig = mutation({
  args: {
    useCase: v.string(),
    primary: v.string(),
    fallback: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const useCase = args.useCase;
    if (!(USE_CASES as readonly string[]).includes(useCase)) {
      throw new Error(`Unknown use-case: ${useCase}`);
    }
    const trimmedPrimary = args.primary.trim();
    const trimmedFallback = args.fallback.trim();
    if (!trimmedPrimary || !trimmedFallback) {
      throw new Error("Primary and fallback are both required");
    }

    const existing = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", useCase))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        primary: trimmedPrimary,
        fallback: trimmedFallback,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
      });
    } else {
      await ctx.db.insert("aiModelConfig", {
        useCase,
        primary: trimmedPrimary,
        fallback: trimmedFallback,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
      });
    }
  },
});

export const clearConfig = mutation({
  args: { useCase: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aiModelConfig")
      .withIndex("by_useCase", (q) => q.eq("useCase", args.useCase))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
```

- [ ] **Step 2: Push the new function**

```bash
npx convex dev --once
```

Expected: completes without errors.

- [ ] **Step 3: Smoke-test resolution order via the Convex dashboard**

Open the Convex dashboard → Functions → `aiModels:listConfig` → Run with `{}`. Expected: returns 5 entries (one per use-case), all with `primary: null` (no rows yet).

Then: Functions → `aiModels:setConfig` → Run with:
```json
{ "useCase": "default", "primary": "google/gemini-2.5-flash", "fallback": "qwen/qwen3.6-plus", "updatedBy": "test" }
```
Expected: succeeds.

Run `aiModels:listConfig` again. Expected: `default` row populated, others still null.

Then run `aiModels:clearConfig` with `{ "useCase": "default" }`. Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add convex/aiModels.ts
git commit -m "feat(admin-models): add resolveModels helper + config queries/mutations"
```

---

## Task 5: Wire resolver into Signal Reports action

**Files:**
- Modify: `convex/signalReportsAction.ts`

- [ ] **Step 1: Replace constant usage with resolver**

In `convex/signalReportsAction.ts`:

Change the imports block (currently lines 1–9) to:
```ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  buildSignalPrompt,
  calculateOverallScore,
} from "../lib/signal-prompt";
import { resolveModels } from "./aiModels";
```

Note: `resolveModels` requires a `QueryCtx`. The existing handler uses `internalAction`, which has an `ActionCtx` that exposes `runQuery` but not `db`. Wrap the resolver in an internal query and call it via `runQuery`.

Add to `convex/aiModels.ts` (just under `listConfig`):

```ts
import { internalQuery } from "./_generated/server";

export const resolveModelsInternal = internalQuery({
  args: { useCase: v.string() },
  handler: async (ctx, args) => {
    if (!(USE_CASES as readonly string[]).includes(args.useCase)) {
      throw new Error(`Unknown use-case: ${args.useCase}`);
    }
    return resolveModels(ctx, args.useCase as UseCase);
  },
});
```

Then in `convex/signalReportsAction.ts`, inside the handler, replace the lines that read `OPENROUTER_MODEL_PRIMARY` and `OPENROUTER_MODEL_FALLBACK`. The original block (around lines 114–141) becomes:

```ts
    const { primary, fallback } = await ctx.runQuery(
      internal.aiModels.resolveModelsInternal,
      { useCase: "signal_reports" },
    );

    let result: LlmResult;
    let modelUsed = primary;

    try {
      result = await callOpenRouter(primary, system, user);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      try {
        modelUsed = fallback;
        result = await callOpenRouter(fallback, system, user);
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        console.error("Signal report generation failed", {
          reportId: args.reportId,
          primary: primaryMsg,
          fallback: fallbackMsg,
        });
        await ctx.runMutation(internal.signalReports.failReport, {
          reportId: args.reportId,
          status: "llm_failed",
        });
        return;
      }
    }
```

Everything else in the action stays unchanged.

- [ ] **Step 2: Typecheck**

```bash
npx convex dev --once && npm run lint -- convex/signalReportsAction.ts convex/aiModels.ts
```

Expected: both succeed.

- [ ] **Step 3: Manual smoke test**

In the Convex dashboard, run `signalReports:requestReport` (or trigger from the live `/free-demo` flow with a throwaway URL). Verify the report completes successfully (the table row's `status` becomes `complete`). The model used will be the hardcoded fallback (no DB rows configured yet) — confirming the safety-net path works.

- [ ] **Step 4: Commit**

```bash
git add convex/signalReportsAction.ts convex/aiModels.ts
git commit -m "feat(admin-models): wire signal-reports through resolveModels"
```

---

## Task 6: Wire resolver into Signal Insights action

**Files:**
- Modify: `convex/signalInsightsAction.ts`

- [ ] **Step 1: Replace constant usage**

Change the imports block (currently lines 4–14) to:
```ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  ReportFragment,
  SectionKey,
} from "../lib/insights-prompt";
```

Inside the handler, replace the constant-reading block (around lines 94–124) so the model assignments come from the resolver:

```ts
    const { primary, fallback } = await ctx.runQuery(
      internal.aiModels.resolveModelsInternal,
      { useCase: "signal_insights" },
    );

    let raw: string;
    let modelUsed = primary;

    try {
      raw = await callOpenRouter(primary, INSIGHTS_SYSTEM_PROMPT, userPrompt);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      try {
        modelUsed = fallback;
        raw = await callOpenRouter(fallback, INSIGHTS_SYSTEM_PROMPT, userPrompt);
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        await ctx.runMutation(internal.signalInsights.failInsight, {
          insightId: args.insightId,
          errorMessage: `Both models failed.\nPrimary: ${primaryMsg}\nFallback: ${fallbackMsg}`,
        });
        return;
      }
    }
```

- [ ] **Step 2: Typecheck**

```bash
npx convex dev --once && npm run lint -- convex/signalInsightsAction.ts
```

Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add convex/signalInsightsAction.ts
git commit -m "feat(admin-models): wire signal-insights through resolveModels"
```

---

## Task 7: Wire resolver into Email Campaigns action

**Files:**
- Modify: `convex/emailCampaignsAction.ts`

This file has **two** call sites: `generateSequence` (one call per role inside a loop) and `verifySequence`. Both must use the resolver. The resolver should be called once at the top of each handler so the loop reuses the resolved values.

- [ ] **Step 1: Edit `generateSequence`**

Remove the local constants near the top of the file:
```ts
const MODEL_PRIMARY = "google/gemini-2.5-flash";
const MODEL_FALLBACK = "qwen/qwen3.6-plus";
```

Inside `generateSequence`'s handler, just after the `data` destructuring guard (after line 62), add:
```ts
    const { primary: MODEL_PRIMARY, fallback: MODEL_FALLBACK } =
      await ctx.runQuery(internal.aiModels.resolveModelsInternal, {
        useCase: "email_drafts",
      });
```

Leave the rest of `generateSequence` unchanged — the existing references to `MODEL_PRIMARY` / `MODEL_FALLBACK` inside the loop now resolve to these block-scoped consts.

- [ ] **Step 2: Edit `verifySequence`**

Inside `verifySequence`'s handler, just after the `data` guard at line ~282, add the same block:
```ts
    const { primary: MODEL_PRIMARY, fallback: MODEL_FALLBACK } =
      await ctx.runQuery(internal.aiModels.resolveModelsInternal, {
        useCase: "email_drafts",
      });
```

Both call sites inside `verifySequence` (the verifier primary call, and the fallback call) already reference `MODEL_PRIMARY` / `MODEL_FALLBACK` — they pick up the new block-scoped values automatically.

- [ ] **Step 3: Typecheck**

```bash
npx convex dev --once && npm run lint -- convex/emailCampaignsAction.ts
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add convex/emailCampaignsAction.ts
git commit -m "feat(admin-models): wire email-campaigns generation+verifier through resolveModels"
```

---

## Task 8: Extract content-ideas prompt builders

**Files:**
- Create: `lib/ai/prompts/content-ideas.ts`
- Modify: `app/api/content-ideas/route.ts`

- [ ] **Step 1: Move the prompt construction into a helper**

Create `lib/ai/prompts/content-ideas.ts` with the exact prompt text from the route handler:

```ts
// lib/ai/prompts/content-ideas.ts

export interface ContentIdeasInput {
  name: string;
  email: string;
  businessDescription: string;
  goal: string;
  channelsTried: string[];
  frustration: string;
  timePerWeek: string;
  website?: string;
}

export interface ContentIdea {
  title: string;
  format: string;
  keyword: string;
  why: string;
  brief: string;
  timeEstimate: string;
  priority: number;
}

export interface ContentIdeasResult {
  summary: string;
  ideas: ContentIdea[];
}

export const CONTENT_IDEAS_SYSTEM_PROMPT = `You are an expert content strategist who creates highly specific, actionable content plans for UK small businesses. You understand SEO, the AI search era, and what actually drives enquiries for local and service businesses.

You will receive detailed context about a business: what they do, who they serve, their main goal, what marketing they've tried, their biggest frustration, and how much time they have. Use ALL of this context to create a plan that feels personally crafted — not generic.

You MUST respond with valid JSON only — no markdown, no code fences, no commentary outside the JSON.

Return this exact structure:
{
  "summary": "A 2-3 sentence overview of the strategy — why this plan suits their specific business, goal, and time budget.",
  "ideas": [
    {
      "title": "A specific, ready-to-use title they could publish as-is",
      "format": "blog article | case study | video script | interactive tool | email sequence | social series | guide",
      "keyword": "A realistic target keyword or search phrase for a small business",
      "why": "One sentence explaining why this idea works for THEIR specific business and goal",
      "brief": "3-4 sentences explaining the angle, structure, and what to include. Detailed enough to hand to a writer.",
      "timeEstimate": "e.g. 2-3 hours, 30 minutes, 1 hour",
      "priority": 1
    }
  ]
}

Rules:
- Produce exactly 6 ideas, numbered by priority (1 = highest impact, do this first)
- If they've tried channels before, build on what they know — don't suggest starting from scratch
- If their goal is leads, weight ideas toward conversion. If authority, weight toward depth and shareability
- If they say they'd rather outsource, make the briefs detailed enough to hand to a writer or agency
- Match the plan's total time commitment to their stated weekly availability across 90 days
- Use UK English throughout. Reference UK-specific platforms and behaviours where relevant
- Be specific to their industry. A plumber gets different ideas than an accountant
- Never suggest "start a blog" as an idea. Every idea must be a specific piece of content with a clear angle
- The summary should reference their business name/type and stated goal`;

export function buildContentIdeasUserPrompt(input: ContentIdeasInput): string {
  const channels =
    input.channelsTried.length > 0
      ? input.channelsTried.join(", ")
      : "Nothing yet";

  return `Business owner: ${input.name}
${input.website ? `Website: ${input.website}` : "No website provided"}

About their business:
${input.businessDescription}

Primary goal: ${input.goal}

Marketing channels they've already tried: ${channels}

Their biggest frustration with marketing right now:
${input.frustration}

Time available for content each week: ${input.timePerWeek}

Create a personalised 90-day content plan for ${input.name}'s business. Respond with JSON only.`;
}
```

- [ ] **Step 2: Refactor the route handler to use the helper + resolver**

In `app/api/content-ideas/route.ts`:

Replace the imports block (lines 1–8) with:
```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "@/convex/_generated/api";
import { verifySession } from "@/lib/session";
import {
  CONTENT_IDEAS_SYSTEM_PROMPT,
  buildContentIdeasUserPrompt,
  type ContentIdeasInput,
  type ContentIdeasResult,
} from "@/lib/ai/prompts/content-ideas";
```

Delete the inline `SYSTEM_PROMPT`, `buildUserPrompt`, `GeneratorInput`, `ContentIdea`, and `LlmResult` definitions (lines 13–72). Replace any usage of `GeneratorInput` with `ContentIdeasInput` and `LlmResult` with `ContentIdeasResult`.

Update `callOpenRouter` so it accepts a `ContentIdeasInput` and uses the imported helpers:
```ts
async function callOpenRouter(
  model: string,
  input: ContentIdeasInput,
): Promise<ContentIdeasResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": "Dreamfree Content Idea Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: CONTENT_IDEAS_SYSTEM_PROMPT },
        { role: "user", content: buildContentIdeasUserPrompt(input) },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from OpenRouter");
  }

  const cleaned = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  return JSON.parse(cleaned) as ContentIdeasResult;
}
```

Replace the production model resolution (around lines 175–186) so it pulls from the resolver via the Convex HTTP client:
```ts
  const { primary: MODEL_PRIMARY, fallback: MODEL_FALLBACK } =
    await convex.query(api.aiModels.resolveModelsPublic, {
      useCase: "content_ideas",
    });

  let result: ContentIdeasResult;
  const startTime = Date.now();
  try {
    console.log(`[content-ideas] Calling primary model: ${MODEL_PRIMARY}`);
    result = await callOpenRouter(MODEL_PRIMARY, input);
    console.log(`[content-ideas] Primary model succeeded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (primaryErr) {
    console.log(`[content-ideas] Primary model failed after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
    const fallbackStart = Date.now();
    try {
      console.log(`[content-ideas] Calling fallback model: ${MODEL_FALLBACK}`);
      result = await callOpenRouter(MODEL_FALLBACK, input);
      console.log(`[content-ideas] Fallback model succeeded in ${((Date.now() - fallbackStart) / 1000).toFixed(1)}s`);
    } catch (fallbackErr) {
      console.log(`[content-ideas] Fallback model failed after ${((Date.now() - fallbackStart) / 1000).toFixed(1)}s:`, fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
      return NextResponse.json(
        { error: "llm_failed", message: "Something went wrong generating your plan. Please try again." },
        { status: 500 },
      );
    }
  }
```

- [ ] **Step 3: Add a public-readable resolver query**

The Next.js route handler runs outside Convex's auth context, so it uses `ConvexHttpClient` and can only call `query`/`mutation`/`action` (not `internalQuery`). Add a public wrapper to `convex/aiModels.ts`:

```ts
export const resolveModelsPublic = query({
  args: { useCase: v.string() },
  handler: async (ctx, args) => {
    if (!(USE_CASES as readonly string[]).includes(args.useCase)) {
      throw new Error(`Unknown use-case: ${args.useCase}`);
    }
    return resolveModels(ctx, args.useCase as UseCase);
  },
});
```

Note: this is read-only and returns model slugs, which are not secrets. Acceptable to expose publicly.

- [ ] **Step 4: Typecheck and lint**

```bash
npx convex dev --once && npm run lint
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts/content-ideas.ts app/api/content-ideas/route.ts convex/aiModels.ts
git commit -m "feat(admin-models): extract content-ideas prompt + wire through resolveModels"
```

---

## Task 9: OpenRouter call with metrics

**Files:**
- Create: `lib/ai/openrouter-metered.ts`

This is used only by the replay runner — it's a separate helper, not a replacement for the existing `callOpenRouter` functions, so the live actions are unaffected.

- [ ] **Step 1: Write the helper**

```ts
// lib/ai/openrouter-metered.ts

const PER_CALL_TIMEOUT_MS = 90_000;

export interface MeteredCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  responseFormat?: "json_object";
}

export interface MeteredCallResult {
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  rawResponse: unknown;
}

export class MeteredCallError extends Error {
  constructor(
    message: string,
    public readonly latencyMs: number,
    public readonly rawResponse?: unknown,
  ) {
    super(message);
    this.name = "MeteredCallError";
  }
}

export async function callOpenRouterMetered(
  opts: MeteredCallOptions,
): Promise<MeteredCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new MeteredCallError("OPENROUTER_API_KEY env var is not set", 0);
  }

  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": "Dreamfree Model Replay",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      temperature: opts.temperature,
      ...(opts.responseFormat === "json_object" && {
        response_format: { type: "json_object" },
      }),
    }),
    signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
  });

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MeteredCallError(
      `OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`,
      latencyMs,
    );
  }

  const data = (await res.json()) as {
    error?: unknown;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (data.error) {
    const message =
      typeof data.error === "string"
        ? data.error
        : (data.error as { message?: string }).message ?? JSON.stringify(data.error);
    throw new MeteredCallError(`OpenRouter error: ${message}`, latencyMs, data);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new MeteredCallError(
      `Empty response (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
      latencyMs,
      data,
    );
  }

  return {
    output: content,
    latencyMs,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    rawResponse: data,
  };
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint -- lib/ai/openrouter-metered.ts
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/openrouter-metered.ts
git commit -m "feat(admin-models): add metered OpenRouter caller for replay runs"
```

---

## Task 10: Pricing fetch + cost helper

**Files:**
- Create: `convex/aiModelPricing.ts`
- Create: `lib/ai/cost.ts`
- Create: `scripts/check-cost.ts`

- [ ] **Step 1: Write the cost helper**

```ts
// lib/ai/cost.ts

const USD_TO_GBP = 0.79; // approx; updated manually if drift matters

export function estimateCostGbp(
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  pricing: { promptUsdPerMillion: number; completionUsdPerMillion: number } | null,
): number | undefined {
  if (!pricing) return undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  const promptUsd =
    ((promptTokens ?? 0) / 1_000_000) * pricing.promptUsdPerMillion;
  const completionUsd =
    ((completionTokens ?? 0) / 1_000_000) * pricing.completionUsdPerMillion;
  return (promptUsd + completionUsd) * USD_TO_GBP;
}
```

- [ ] **Step 2: Write the pricing module**

```ts
// convex/aiModelPricing.ts
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";

interface OpenRouterModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

export const refreshPricing = internalAction({
  args: {},
  handler: async (ctx) => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) {
      console.error(`refreshPricing: HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { data?: OpenRouterModel[] };
    const models = json.data ?? [];
    const records = models
      .map((m) => {
        const promptStr = m.pricing?.prompt;
        const completionStr = m.pricing?.completion;
        if (!promptStr || !completionStr) return null;
        const promptUsd = Number(promptStr) * 1_000_000;
        const completionUsd = Number(completionStr) * 1_000_000;
        if (!Number.isFinite(promptUsd) || !Number.isFinite(completionUsd)) {
          return null;
        }
        return {
          model: m.id,
          promptUsdPerMillion: promptUsd,
          completionUsdPerMillion: completionUsd,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    await ctx.runMutation(internal.aiModelPricing.bulkUpsertPricing, {
      records,
    });
    console.log(`refreshPricing: stored ${records.length} model prices`);
  },
});

export const bulkUpsertPricing = internalMutation({
  args: {
    records: v.array(
      v.object({
        model: v.string(),
        promptUsdPerMillion: v.number(),
        completionUsdPerMillion: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.records) {
      const existing = await ctx.db
        .query("aiModelPricing")
        .withIndex("by_model", (q) => q.eq("model", r.model))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          promptUsdPerMillion: r.promptUsdPerMillion,
          completionUsdPerMillion: r.completionUsdPerMillion,
          fetchedAt: now,
        });
      } else {
        await ctx.db.insert("aiModelPricing", {
          model: r.model,
          promptUsdPerMillion: r.promptUsdPerMillion,
          completionUsdPerMillion: r.completionUsdPerMillion,
          fetchedAt: now,
        });
      }
    }
  },
});

export const getPricing = internalQuery({
  args: { model: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiModelPricing")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .unique();
    if (!row) return null;
    return {
      promptUsdPerMillion: row.promptUsdPerMillion,
      completionUsdPerMillion: row.completionUsdPerMillion,
    };
  },
});
```

- [ ] **Step 3: Schedule the daily refresh**

Edit `convex/crons.ts` (create if it doesn't exist):

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "refresh openrouter pricing",
  { hourUTC: 3, minuteUTC: 0 },
  internal.aiModelPricing.refreshPricing,
);

export default crons;
```

If `convex/crons.ts` already exists, add only the `crons.daily(...)` call inside it; do not duplicate the import or `cronJobs()` instantiation.

- [ ] **Step 4: Push and run pricing once manually**

```bash
npx convex dev --once
```

Then in the Convex dashboard, run `aiModelPricing:refreshPricing` (Internal → Functions). Expected: log shows `refreshPricing: stored <N> model prices` where N is in the hundreds. The `aiModelPricing` table populates.

- [ ] **Step 5: Smoke-test the cost helper**

```ts
// scripts/check-cost.ts
import { estimateCostGbp } from "../lib/ai/cost";

function assertEqual(actual: number | undefined, expected: number, label: string) {
  if (actual === undefined || Math.abs(actual - expected) > 1e-6) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const pricing = { promptUsdPerMillion: 1.0, completionUsdPerMillion: 2.0 };

// 1M prompt tokens at $1/M = $1, 1M completion at $2/M = $2, total $3 × 0.79 = £2.37
assertEqual(estimateCostGbp(1_000_000, 1_000_000, pricing), 2.37, "basic");

// Missing pricing → undefined
if (estimateCostGbp(100, 100, null) !== undefined) {
  throw new Error("null pricing should return undefined");
}

// Both tokens missing → undefined
if (estimateCostGbp(undefined, undefined, pricing) !== undefined) {
  throw new Error("missing tokens should return undefined");
}

console.log("cost helper OK");
```

Run:
```bash
npx tsx scripts/check-cost.ts
```

Expected: prints `cost helper OK`.

- [ ] **Step 6: Commit**

```bash
git add convex/aiModelPricing.ts convex/crons.ts lib/ai/cost.ts scripts/check-cost.ts
git commit -m "feat(admin-models): add OpenRouter pricing cache + daily refresh + cost helper"
```

---

## Task 11: Replay action — record listing + prompt rebuilders

**Files:**
- Modify: `convex/aiModels.ts`

The replay UI needs a list of recent records per use-case, plus the ability to rebuild the exact production prompt for a chosen record.

- [ ] **Step 1: Add `listReplayableRecords` query**

Append to `convex/aiModels.ts`:

```ts
import type { Doc } from "./_generated/dataModel";

interface ReplayableRecord {
  id: string;
  label: string;          // human-readable for the picker (e.g. "lead@example.com — score 67")
  subLabel?: string;      // optional secondary line (e.g. URL, role, date)
  createdAt: number;
}

export const listReplayableRecords = query({
  args: {
    useCase: v.string(),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const search = args.search?.trim().toLowerCase() ?? "";

    if (args.useCase === "signal_reports") {
      const reports = await ctx.db
        .query("signalReports")
        .order("desc")
        .take(200);
      const filtered = reports
        .filter((r) => r.status === "complete")
        .filter((r) =>
          search.length === 0
            ? true
            : (r.email?.toLowerCase().includes(search) ?? false) ||
              (r.url?.toLowerCase().includes(search) ?? false),
        )
        .slice(0, limit)
        .map<ReplayableRecord>((r) => ({
          id: r._id,
          label: `${r.email ?? "unknown"} — ${r.url ?? "no url"}`,
          subLabel: `score ${r.overallScore ?? "?"} · ${new Date(r._creationTime).toLocaleDateString("en-GB")}`,
          createdAt: r._creationTime,
        }));
      return filtered;
    }

    if (args.useCase === "signal_insights") {
      const insights = await ctx.db
        .query("signalInsights")
        .order("desc")
        .take(200);
      return insights
        .filter((i) => i.status === "complete")
        .filter((i) =>
          search.length === 0
            ? true
            : i.section.toLowerCase().includes(search),
        )
        .slice(0, limit)
        .map<ReplayableRecord>((i) => ({
          id: i._id,
          label: `${i.section} insight`,
          subLabel: new Date(i._creationTime).toLocaleDateString("en-GB"),
          createdAt: i._creationTime,
        }));
    }

    if (args.useCase === "email_drafts") {
      const drafts = await ctx.db.query("emailDrafts").order("desc").take(200);
      const enrollmentIds = Array.from(new Set(drafts.map((d) => d.enrollmentId)));
      const enrollmentMap = new Map<string, Doc<"emailEnrollments"> | null>();
      for (const eid of enrollmentIds) {
        enrollmentMap.set(eid, await ctx.db.get(eid));
      }
      const leadIds = Array.from(
        new Set(
          [...enrollmentMap.values()]
            .filter((e): e is Doc<"emailEnrollments"> => e !== null)
            .map((e) => e.leadId),
        ),
      );
      const leadMap = new Map<string, Doc<"leads"> | null>();
      for (const lid of leadIds) {
        leadMap.set(lid, await ctx.db.get(lid));
      }
      return drafts
        .map((d) => {
          const enrollment = enrollmentMap.get(d.enrollmentId);
          const lead = enrollment ? leadMap.get(enrollment.leadId) : null;
          const email = lead?.email ?? "unknown";
          if (search.length > 0 && !email.toLowerCase().includes(search) && !d.role.toLowerCase().includes(search)) {
            return null;
          }
          return {
            id: d._id,
            label: `${email} — role ${d.role}`,
            subLabel: new Date(d._creationTime).toLocaleDateString("en-GB"),
            createdAt: d._creationTime,
          } as ReplayableRecord;
        })
        .filter((d): d is ReplayableRecord => d !== null)
        .slice(0, limit);
    }

    if (args.useCase === "content_ideas") {
      const leads = await ctx.db
        .query("leads")
        .order("desc")
        .take(200);
      return leads
        .filter((l) =>
          search.length === 0
            ? true
            : (l.email?.toLowerCase().includes(search) ?? false) ||
              (l.businessDescription?.toLowerCase().includes(search) ?? false),
        )
        .slice(0, limit)
        .map<ReplayableRecord>((l) => ({
          id: l._id,
          label: l.email ?? "unknown",
          subLabel: l.businessDescription?.slice(0, 80) ?? "",
          createdAt: l._creationTime,
        }));
    }

    throw new Error(`listReplayableRecords: unsupported useCase ${args.useCase}`);
  },
});
```

Note on `leads` table fields: this plan assumes `leads` has `email` and `businessDescription`. If those field names differ, adjust. Verify with the dashboard's Data tab on the `leads` table.

- [ ] **Step 2: Lint and Convex push**

```bash
npx convex dev --once && npm run lint -- convex/aiModels.ts
```

Expected: succeeds.

- [ ] **Step 3: Smoke-test in the Convex dashboard**

For each of `signal_reports`, `signal_insights`, `email_drafts`, `content_ideas`, run `aiModels:listReplayableRecords` with `{ "useCase": "<key>" }`. Expected: each returns up to 50 entries with non-empty labels (assuming the DB has any records). Empty arrays are fine for use-cases with no historic data.

- [ ] **Step 4: Commit**

```bash
git add convex/aiModels.ts
git commit -m "feat(admin-models): add listReplayableRecords query"
```

---

## Task 12: Replay action — runReplay

**Files:**
- Create: `convex/aiModelReplay.ts`

This is the core replay execution. It loads the source record, rebuilds the production prompt via existing builders, calls one or two models in parallel, and persists the run.

- [ ] **Step 1: Write `convex/aiModelReplay.ts`**

```ts
// convex/aiModelReplay.ts
import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  callOpenRouterMetered,
  MeteredCallError,
  type MeteredCallResult,
} from "../lib/ai/openrouter-metered";
import { estimateCostGbp } from "../lib/ai/cost";
import {
  buildSignalPrompt,
  calculateOverallScore,
} from "../lib/signal-prompt";
import {
  INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightResponse,
  type SectionKey,
} from "../lib/insights-prompt";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  type ReportForPrompt,
  type LoopLedgerEntry,
  type PriorDraft,
} from "../lib/email-campaigns/generation-prompt";
import {
  validateGenerationResult,
  GenerationResultError,
} from "../lib/email-campaigns/generation-result";
import { ROLES, type Role } from "../lib/email-campaigns/roles";
import { parseLlmJson } from "../lib/email-campaigns/openrouter";
import {
  CONTENT_IDEAS_SYSTEM_PROMPT,
  buildContentIdeasUserPrompt,
} from "../lib/ai/prompts/content-ideas";

interface BuiltPrompt {
  system: string;
  user: string;
  temperature: number;
  responseFormat?: "json_object";
  /** How to validate the model's output. Returns null on success, error msg on failure. */
  validate: (raw: string) => string | null;
}

async function buildPromptForRecord(
  ctx: { runQuery: <T>(...args: unknown[]) => Promise<T> } & Record<string, unknown>,
  useCase: string,
  recordId: string,
): Promise<BuiltPrompt> {
  if (useCase === "signal_reports") {
    const report = await ctx.runQuery(
      internal.aiModelReplay.getSignalReportForReplay,
      { reportId: recordId },
    );
    if (!report) throw new Error(`Signal report ${recordId} not found`);
    const { system, user } = buildSignalPrompt(
      report.strippedContent,
      report.customerDescription,
    );
    return {
      system,
      user,
      temperature: 0.3,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          const parsed = JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
          calculateOverallScore(parsed.elements);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "signal_insights") {
    const data = await ctx.runQuery(
      internal.aiModelReplay.getInsightForReplay,
      { insightId: recordId },
    );
    if (!data) throw new Error(`Signal insight ${recordId} not found`);
    const userPrompt = buildInsightsUserPrompt(
      data.section as SectionKey,
      data.reports,
    );
    return {
      system: INSIGHTS_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.5,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          parseInsightResponse(raw);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "email_drafts") {
    const data = await ctx.runQuery(
      internal.aiModelReplay.getDraftForReplay,
      { draftId: recordId },
    );
    if (!data) throw new Error(`Email draft ${recordId} not found`);
    const { draft, enrollment, lead, voiceSpec, brief, priorDrafts } = data;
    const reportForPrompt: ReportForPrompt = data.reportForPrompt;
    const firstNameCandidate =
      lead.firstName?.trim() || lead.name?.split(" ")[0] || "there";
    const userPrompt = buildGenerationUserPrompt({
      voiceSpec: voiceSpec.body,
      recipientFirstName: firstNameCandidate,
      recipientEmail: lead.email,
      report: reportForPrompt,
      role: draft.role as Role,
      brief: {
        purpose: brief.purpose,
        requiredBeats: brief.requiredBeats,
        loopsToOpen: brief.loopsToOpen,
        loopsToClose: brief.loopsToClose,
        tone: brief.tone,
        lengthGuide: brief.lengthGuide,
        workedExample: brief.workedExample,
      },
      priorDrafts: priorDrafts as PriorDraft[],
      loopLedger: enrollment.loopLedger as LoopLedgerEntry[],
    });
    return {
      system: buildGenerationSystemPrompt(voiceSpec.body),
      user: userPrompt,
      temperature: 0.7,
      responseFormat: "json_object",
      validate: (raw) => {
        try {
          validateGenerationResult(parseLlmJson(raw));
          return null;
        } catch (e) {
          return e instanceof GenerationResultError ? e.message : String(e);
        }
      },
    };
  }

  if (useCase === "content_ideas") {
    const lead = await ctx.runQuery(
      internal.aiModelReplay.getLeadForReplay,
      { leadId: recordId },
    );
    if (!lead) throw new Error(`Lead ${recordId} not found`);
    const userPrompt = buildContentIdeasUserPrompt({
      name: lead.name ?? lead.email ?? "Friend",
      email: lead.email ?? "",
      businessDescription: lead.businessDescription ?? "",
      goal: lead.goal ?? "leads",
      channelsTried: lead.channelsTried ?? [],
      frustration: lead.frustration ?? "",
      timePerWeek: lead.timePerWeek ?? "1-2 hours",
      website: lead.url,
    });
    return {
      system: CONTENT_IDEAS_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.7,
      validate: (raw) => {
        const trimmed = raw.trim();
        if (trimmed.length === 0) return "empty response";
        return null;
      },
    };
  }

  throw new Error(`Unsupported use-case for replay: ${useCase}`);
}

async function runOneCall(
  prompt: BuiltPrompt,
  model: string,
): Promise<{
  model: string;
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  rawResponse: unknown;
  valid: boolean;
  validationError?: string;
}> {
  let result: MeteredCallResult;
  try {
    result = await callOpenRouterMetered({
      model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      temperature: prompt.temperature,
      responseFormat: prompt.responseFormat,
    });
  } catch (err) {
    if (err instanceof MeteredCallError) {
      return {
        model,
        output: "",
        latencyMs: err.latencyMs,
        rawResponse: err.rawResponse,
        valid: false,
        validationError: err.message,
      };
    }
    throw err;
  }

  const validationError = prompt.validate(result.output);
  return {
    model,
    output: result.output,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    rawResponse: result.rawResponse,
    valid: validationError === null,
    validationError: validationError ?? undefined,
  };
}

export const runReplay = action({
  args: {
    useCase: v.string(),
    recordId: v.string(),
    candidateModel: v.string(),
    compareModel: v.optional(v.string()),
    runBy: v.string(),
  },
  handler: async (ctx, args) => {
    const prompt = await buildPromptForRecord(ctx, args.useCase, args.recordId);

    const calls = [runOneCall(prompt, args.candidateModel)];
    if (args.compareModel && args.compareModel !== args.candidateModel) {
      calls.push(runOneCall(prompt, args.compareModel));
    }
    const calledResults = await Promise.all(calls);

    // Look up pricing in parallel for cost estimates
    const enriched = await Promise.all(
      calledResults.map(async (r) => {
        const pricing = await ctx.runQuery(internal.aiModelPricing.getPricing, {
          model: r.model,
        });
        return {
          ...r,
          costGbp: estimateCostGbp(r.promptTokens, r.completionTokens, pricing),
        };
      }),
    );

    const replayId = await ctx.runMutation(
      internal.aiModelReplay.insertReplay,
      {
        useCase: args.useCase,
        recordId: args.recordId,
        candidateModel: args.candidateModel,
        compareModel: args.compareModel,
        results: enriched,
        runBy: args.runBy,
        runAt: Date.now(),
      },
    );

    return { replayId, results: enriched };
  },
});

export const insertReplay = internalMutation({
  args: {
    useCase: v.string(),
    recordId: v.string(),
    candidateModel: v.string(),
    compareModel: v.optional(v.string()),
    results: v.array(v.any()),
    runBy: v.string(),
    runAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiModelReplays", {
      useCase: args.useCase,
      recordId: args.recordId,
      candidateModel: args.candidateModel,
      compareModel: args.compareModel,
      results: args.results,
      runBy: args.runBy,
      runAt: args.runAt,
    });
  },
});

export const listRecentReplays = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiModelReplays")
      .withIndex("by_runAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const getReplay = query({
  args: { replayId: v.id("aiModelReplays") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.replayId);
  },
});

// Internal queries used by buildPromptForRecord ----------------------------

export const getSignalReportForReplay = internalQuery({
  args: { reportId: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId as never);
    if (!report) return null;
    return {
      strippedContent: (report as { strippedContent?: string }).strippedContent ?? "",
      customerDescription:
        (report as { customerDescription?: string }).customerDescription ?? "",
    };
  },
});

export const getInsightForReplay = internalQuery({
  args: { insightId: v.string() },
  handler: async (ctx, args) => {
    const insight = await ctx.db.get(args.insightId as never);
    if (!insight) return null;
    const data = await ctx.runQuery(
      internal.signalInsights.getReportsForInsight,
      { insightId: args.insightId as never },
    );
    if (!data) return null;
    return { section: data.section, reports: data.reports };
  },
});

export const getDraftForReplay = internalQuery({
  args: { draftId: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId as never);
    if (!draft) return null;
    const draftDoc = draft as {
      enrollmentId: string;
      role: string;
      order: number;
      briefVersionUsed: number;
      voiceVersionUsed: number;
    };
    const enrollment = await ctx.db.get(draftDoc.enrollmentId as never);
    if (!enrollment) return null;
    const enrollmentDoc = enrollment as {
      leadId: string;
      reportId: string;
      voiceSpecId: string;
      loopLedger: unknown[];
    };
    const lead = await ctx.db.get(enrollmentDoc.leadId as never);
    const report = await ctx.db.get(enrollmentDoc.reportId as never);
    const voiceSpec = await ctx.db.get(enrollmentDoc.voiceSpecId as never);
    if (!lead || !report || !voiceSpec) return null;

    const briefs = await ctx.db
      .query("emailRoleBriefs")
      .filter((q) =>
        q.and(
          q.eq(q.field("role"), draftDoc.role),
          q.eq(q.field("version"), draftDoc.briefVersionUsed),
        ),
      )
      .collect();
    const brief = briefs[0];
    if (!brief) return null;

    // Prior drafts: drafts in same enrollment with order < this draft's order
    const allDrafts = await ctx.db
      .query("emailDrafts")
      .filter((q) => q.eq(q.field("enrollmentId"), draftDoc.enrollmentId))
      .collect();
    const priorDrafts = allDrafts
      .filter((d) => (d as { order: number }).order < draftDoc.order)
      .sort((a, b) => (a as { order: number }).order - (b as { order: number }).order)
      .map((d) => ({
        role: (d as { role: string }).role,
        subject: (d as { subject: string }).subject,
        bodyText: (d as { bodyText: string }).bodyText,
      }));

    const r = report as {
      url: string;
      customerDescription: string;
      overallScore: number;
      gruntTest: unknown;
      elements: unknown;
      quickWin: string;
      strengths: string[];
      fullSummary: string;
    };

    return {
      draft: { role: draftDoc.role, order: draftDoc.order },
      enrollment: { loopLedger: enrollmentDoc.loopLedger },
      lead,
      voiceSpec,
      brief,
      priorDrafts,
      reportForPrompt: {
        url: r.url,
        customerDescription: r.customerDescription,
        overallScore: r.overallScore,
        gruntTest: r.gruntTest,
        elements: r.elements,
        quickWin: r.quickWin,
        strengths: r.strengths,
        fullSummary: r.fullSummary,
      },
    };
  },
});

export const getLeadForReplay = internalQuery({
  args: { leadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId as never);
  },
});
```

Note on the `as never` casts: they are pragmatic here because `ctx.db.get` is strongly typed by table id but we accept string ids from the UI. Convex will throw at runtime if the id doesn't match a table — which is the desired failure mode.

- [ ] **Step 2: Convex push + lint**

```bash
npx convex dev --once && npm run lint -- convex/aiModelReplay.ts
```

Expected: succeeds. If TypeScript errors surface for the field names on `lead` (e.g. `goal`, `frustration`, `timePerWeek`), inspect `convex/schema.ts:32-50` and adjust the `getLeadForReplay`/`buildPromptForRecord` access to match the actual schema. The `leads` table is the source of truth for what's available.

- [ ] **Step 3: Smoke-test from the dashboard**

Run `aiModelReplay:runReplay` with:
```json
{
  "useCase": "signal_reports",
  "recordId": "<an existing complete signalReports id>",
  "candidateModel": "google/gemini-2.5-flash",
  "compareModel": "google/gemini-2.5-flash",
  "runBy": "test"
}
```

Expected: returns a `replayId` and two `results` with `valid: true`, populated `latencyMs`, populated token counts, and a `costGbp` value. Run `aiModelReplay:listRecentReplays` and confirm the run appears.

- [ ] **Step 4: Commit**

```bash
git add convex/aiModelReplay.ts
git commit -m "feat(admin-models): add replay runner with metered metrics + validation"
```

---

## Task 13: Cleanup cron for old replays

**Files:**
- Modify: `convex/aiModelReplay.ts`
- Modify: `convex/crons.ts`

- [ ] **Step 1: Add cleanup mutation**

Append to `convex/aiModelReplay.ts`:

```ts
export const deleteOldReplays = internalMutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;
    const old = await ctx.db
      .query("aiModelReplays")
      .withIndex("by_runAt", (q) => q.lt("runAt", cutoff))
      .collect();
    for (const row of old) {
      await ctx.db.delete(row._id);
    }
    console.log(`deleteOldReplays: removed ${old.length} replays older than ${new Date(cutoff).toISOString()}`);
  },
});

export const cleanupOldReplays = internalAction({
  args: {},
  handler: async (ctx) => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    await ctx.runMutation(internal.aiModelReplay.deleteOldReplays, {
      olderThanMs: THIRTY_DAYS_MS,
    });
  },
});
```

Update the imports at the top of `convex/aiModelReplay.ts` to include `internalAction`.

- [ ] **Step 2: Schedule it**

Add to `convex/crons.ts`:
```ts
crons.weekly(
  "cleanup old model replays",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.aiModelReplay.cleanupOldReplays,
);
```

- [ ] **Step 3: Push and verify**

```bash
npx convex dev --once
```

Run `aiModelReplay:cleanupOldReplays` once from the dashboard. Expected: log line printed, no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/aiModelReplay.ts convex/crons.ts
git commit -m "feat(admin-models): cleanup replays older than 30 days weekly"
```

---

## Task 14: Admin layout + nav link

**Files:**
- Create: `app/dashboard/admin/layout.tsx`
- Create: `app/dashboard/admin/models/layout.tsx`
- Modify: `app/dashboard/DashboardNav.tsx`

- [ ] **Step 1: Add the dashboard nav link**

Edit `app/dashboard/DashboardNav.tsx`. Update `NAV_ITEMS`:

```tsx
const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/email-campaigns", label: "Email Campaigns" },
  { href: "/dashboard/admin/models", label: "Admin · Models" },
];
```

- [ ] **Step 2: Add the admin layout**

```tsx
// app/dashboard/admin/layout.tsx
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
```

(This file exists primarily as a Next.js route grouping; no extra UI yet. Future admin sub-areas can hang off here.)

- [ ] **Step 3: Add the models sub-layout with tabs**

```tsx
// app/dashboard/admin/models/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/admin/models", label: "Config" },
  { href: "/dashboard/admin/models/replay", label: "Replay" },
];

export default function ModelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">AI Models</h1>
        <p className="mt-1 text-sm text-muted">
          Configure which OpenRouter models power each AI use-case, and replay
          historic prompts against candidate models before promoting them.
        </p>
      </div>
      <nav className="border-b border-border">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/dashboard/admin/models"
                ? pathname === "/dashboard/admin/models"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`-mb-px border-b-2 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-teal text-teal"
                    : "border-transparent text-muted hover:text-charcoal"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Lint**

```bash
npm run lint -- app/dashboard/admin app/dashboard/DashboardNav.tsx
```

Expected: succeeds (Note: the routes will fail Next.js's missing-page warning — that's fixed in the next two tasks).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/admin app/dashboard/DashboardNav.tsx
git commit -m "feat(admin-models): add admin nav link + models sub-layout"
```

---

## Task 15: Config page

**Files:**
- Create: `app/dashboard/admin/models/page.tsx`
- Create: `app/dashboard/admin/models/ConfigClient.tsx`

- [ ] **Step 1: Server component shell**

```tsx
// app/dashboard/admin/models/page.tsx
import { verifySession } from "@/lib/session";
import { ConfigClient } from "./ConfigClient";

export default async function ModelsConfigPage() {
  const session = await verifySession();
  return <ConfigClient adminEmail={session?.email ?? "unknown"} />;
}
```

- [ ] **Step 2: Client component**

```tsx
// app/dashboard/admin/models/ConfigClient.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { USE_CASE_LABELS, type UseCase } from "@/lib/ai/use-cases";

interface RowState {
  useCase: UseCase;
  primary: string;
  fallback: string;
}

export function ConfigClient({ adminEmail }: { adminEmail: string }) {
  const config = useQuery(api.aiModels.listConfig);
  const setConfig = useMutation(api.aiModels.setConfig);
  const clearConfig = useMutation(api.aiModels.clearConfig);
  const [editing, setEditing] = useState<RowState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (config === undefined) {
    return <div className="text-muted">Loading…</div>;
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await setConfig({
        useCase: editing.useCase,
        primary: editing.primary,
        fallback: editing.fallback,
        updatedBy: adminEmail,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset(useCase: UseCase) {
    if (!confirm(`Reset ${USE_CASE_LABELS[useCase]} to use the default config?`)) return;
    await clearConfig({ useCase });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-warm-grey/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 text-left">Use case</th>
              <th className="px-4 py-3 text-left">Primary model</th>
              <th className="px-4 py-3 text-left">Fallback model</th>
              <th className="px-4 py-3 text-left">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.map((row) => {
              const isEditing = editing?.useCase === row.useCase;
              const isOverridden = row.primary !== null;
              return (
                <tr key={row.useCase} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-charcoal">
                    {USE_CASE_LABELS[row.useCase as UseCase]}
                  </td>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          className="w-full rounded border border-border px-2 py-1"
                          value={editing!.primary}
                          onChange={(e) =>
                            setEditing({ ...editing!, primary: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="w-full rounded border border-border px-2 py-1"
                          value={editing!.fallback}
                          onChange={(e) =>
                            setEditing({ ...editing!, fallback: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-muted">—</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          className="mr-2 rounded bg-teal px-3 py-1 text-white disabled:opacity-50"
                          onClick={save}
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="rounded border border-border px-3 py-1"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs">
                        {isOverridden ? row.primary : <span className="text-muted">(uses default)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {isOverridden ? row.fallback : <span className="text-muted">(uses default)</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {row.updatedAt
                          ? new Date(row.updatedAt).toLocaleString("en-GB")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="mr-2 rounded border border-border px-3 py-1 text-xs"
                          onClick={() =>
                            setEditing({
                              useCase: row.useCase as UseCase,
                              primary: row.primary ?? "",
                              fallback: row.fallback ?? "",
                            })
                          }
                        >
                          Edit
                        </button>
                        {isOverridden && row.useCase !== "default" && (
                          <button
                            className="rounded border border-border px-3 py-1 text-xs text-muted"
                            onClick={() => reset(row.useCase as UseCase)}
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="text-sm text-muted">
        Need a model slug?{" "}
        <a
          href="https://openrouter.ai/models"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal underline"
        >
          Browse OpenRouter models →
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint + manual smoke test**

```bash
npm run lint -- app/dashboard/admin/models
npm run dev
```

Visit `http://localhost:3000/dashboard/admin/models` (must be signed in as an admin). Expected:
- Table shows 5 rows, each labelled.
- Click "Edit" on `default` → two text inputs appear.
- Enter `google/gemini-2.5-flash` and `qwen/qwen3.6-plus`, click Save → row updates immediately, "Updated" column populates.
- Click "Edit" on `default` again, change values, Save → row updates.
- Configure another row (e.g. `signal_reports`), then click "Reset" → row reverts to "(uses default)".

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/admin/models/page.tsx app/dashboard/admin/models/ConfigClient.tsx
git commit -m "feat(admin-models): add config page with inline edit + reset"
```

---

## Task 16: Replay page

**Files:**
- Create: `app/dashboard/admin/models/replay/page.tsx`
- Create: `app/dashboard/admin/models/replay/ReplayClient.tsx`

- [ ] **Step 1: Server shell**

```tsx
// app/dashboard/admin/models/replay/page.tsx
import { verifySession } from "@/lib/session";
import { ReplayClient } from "./ReplayClient";

export default async function ModelsReplayPage() {
  const session = await verifySession();
  return <ReplayClient adminEmail={session?.email ?? "unknown"} />;
}
```

- [ ] **Step 2: Client component**

```tsx
// app/dashboard/admin/models/replay/ReplayClient.tsx
"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  REPLAYABLE_USE_CASES,
  USE_CASE_LABELS,
  type UseCase,
} from "@/lib/ai/use-cases";

interface ReplayResult {
  model: string;
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costGbp?: number;
  valid: boolean;
  validationError?: string;
  rawResponse?: unknown;
}

export function ReplayClient({ adminEmail }: { adminEmail: string }) {
  const [useCase, setUseCase] = useState<UseCase>("signal_reports");
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [candidateModel, setCandidateModel] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReplayResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const records = useQuery(api.aiModels.listReplayableRecords, {
    useCase,
    search: search || undefined,
    limit: 50,
  });
  const liveConfig = useQuery(api.aiModels.resolveModelsPublic, { useCase });
  const recentReplays = useQuery(api.aiModelReplay.listRecentReplays, { limit: 20 });
  const runReplay = useAction(api.aiModelReplay.runReplay);

  // When live config loads, prefill compareModel with live primary if empty.
  if (liveConfig && compareModel === "") {
    setCompareModel(liveConfig.primary);
  }

  async function run() {
    if (!recordId || !candidateModel.trim()) {
      setError("Pick a record and enter a candidate model.");
      return;
    }
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const out = await runReplay({
        useCase,
        recordId,
        candidateModel: candidateModel.trim(),
        compareModel: compareModel.trim() || undefined,
        runBy: adminEmail,
      });
      setResults(out.results as ReplayResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Use case</label>
          <select
            className="w-full rounded border border-border px-2 py-1.5"
            value={useCase}
            onChange={(e) => {
              setUseCase(e.target.value as UseCase);
              setRecordId(null);
              setCompareModel("");
            }}
          >
            {REPLAYABLE_USE_CASES.map((uc) => (
              <option key={uc} value={uc}>
                {USE_CASE_LABELS[uc]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Search records
          </label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5"
            placeholder="email, role, URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Source record</label>
        <div className="max-h-60 overflow-y-auto rounded border border-border bg-white">
          {records === undefined ? (
            <div className="p-3 text-sm text-muted">Loading…</div>
          ) : records.length === 0 ? (
            <div className="p-3 text-sm text-muted">No records found.</div>
          ) : (
            records.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-warm-grey/40 ${
                  recordId === r.id ? "bg-teal/10" : ""
                }`}
                onClick={() => setRecordId(r.id)}
              >
                <div className="font-medium">{r.label}</div>
                {r.subLabel && (
                  <div className="text-xs text-muted">{r.subLabel}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Candidate model</label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5 font-mono text-sm"
            placeholder="e.g. anthropic/claude-sonnet-4.6"
            value={candidateModel}
            onChange={(e) => setCandidateModel(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Compare against (live primary by default)
          </label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5 font-mono text-sm"
            value={compareModel}
            onChange={(e) => setCompareModel(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="rounded bg-teal px-4 py-2 text-white disabled:opacity-50"
          onClick={run}
          disabled={running || !recordId || !candidateModel.trim()}
        >
          {running ? "Running…" : "Run replay"}
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {results && (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((r, i) => (
            <ResultCard key={`${r.model}-${i}`} result={r} />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-bold text-charcoal">Recent replays</h2>
        <div className="rounded border border-border bg-white">
          {recentReplays === undefined ? (
            <div className="p-3 text-sm text-muted">Loading…</div>
          ) : recentReplays.length === 0 ? (
            <div className="p-3 text-sm text-muted">No replays yet.</div>
          ) : (
            recentReplays.map((rp) => (
              <button
                key={rp._id}
                type="button"
                className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-warm-grey/40"
                onClick={() => setResults(rp.results as ReplayResult[])}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    {rp.useCase} · {rp.candidateModel}
                    {rp.compareModel ? ` vs ${rp.compareModel}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(rp.runAt).toLocaleString("en-GB")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: ReplayResult }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs">{result.model}</div>
        <div
          className={`rounded-full px-2 py-0.5 text-xs ${
            result.valid
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {result.valid ? "✓ valid" : "✗ invalid"}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-muted">
        <div>
          <div className="text-charcoal">{result.latencyMs}ms</div>
          <div>latency</div>
        </div>
        <div>
          <div className="text-charcoal">
            {result.promptTokens ?? "—"} / {result.completionTokens ?? "—"}
          </div>
          <div>prompt / completion</div>
        </div>
        <div>
          <div className="text-charcoal">
            {result.costGbp !== undefined
              ? `£${result.costGbp.toFixed(5)}`
              : "—"}
          </div>
          <div>est. cost</div>
        </div>
      </div>
      {result.validationError && (
        <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {result.validationError}
        </div>
      )}
      <details className="mb-2">
        <summary className="cursor-pointer text-sm font-medium">Output</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-warm-grey/40 p-2 text-xs">
          {result.output || "(empty)"}
        </pre>
      </details>
      <button
        className="text-xs text-muted underline"
        onClick={() => setShowRaw((x) => !x)}
      >
        {showRaw ? "Hide" : "Show"} raw response
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-warm-grey/40 p-2 text-xs">
          {JSON.stringify(result.rawResponse, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Lint + manual smoke test**

```bash
npm run lint -- app/dashboard/admin/models/replay
npm run dev
```

Visit `http://localhost:3000/dashboard/admin/models/replay`. Expected:
- Use-case dropdown shows the 4 replayable use-cases.
- Source-record list populates after a moment (or shows "No records found" if the dev DB is empty for that use-case).
- Selecting a record highlights it.
- "Compare against" auto-populates with the currently-live primary.
- Entering a candidate model + clicking Run → spinner → two cards appear with metrics.
- "Recent replays" lists the run.
- Clicking a recent replay re-loads its results into the cards.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/admin/models/replay
git commit -m "feat(admin-models): add replay page with side-by-side metrics + recent runs"
```

---

## Task 17: End-to-end production verification

**Files:**
- None modified.

This is a manual verification gate — do not skip it.

- [ ] **Step 1: Full build passes**

```bash
npm run lint && npm run build
```

Expected: both succeed.

- [ ] **Step 2: Round-trip test on dev**

With `npm run dev` and `npx convex dev` running:

1. Trigger a Signal Report from `/free-demo` with a throwaway URL. Confirm it completes (no DB rows in `aiModelConfig`, falls through to hardcoded constants).
2. In `/dashboard/admin/models`, set the `default` row to `{primary: google/gemini-2.5-flash, fallback: qwen/qwen3.6-plus}`. Trigger another Signal Report. Confirm it completes.
3. Override `signal_reports` to `{primary: anthropic/claude-haiku-4.5, fallback: google/gemini-2.5-flash}`. Trigger another Signal Report. In Convex logs, confirm the call used the override (look for the model id in the OpenRouter response or add temporary `console.log` if needed). Reset the override.
4. Run a replay against an existing Signal Report with a known-good model and a deliberately-bad model slug (`fake/nope`). Confirm the candidate fails with `valid: false` and the comparison succeeds.

- [ ] **Step 3: Open a PR**

```bash
gh pr create --title "Admin AI model config + replay tester" --body "$(cat <<'EOF'
## Summary
- Adds runtime-editable per-use-case primary+fallback model config (Convex `aiModelConfig`)
- Adds `resolveModels` chained-fallback helper (use-case → default → hardcoded constants)
- Wires Signal Reports, Signal Insights, Email Campaigns (gen + verify), and Content Ideas through the resolver
- Adds replay tester UI: pick historic record, run candidate vs. compare model, see latency / tokens / £ cost / validation side by side
- Adds OpenRouter pricing cache (daily refresh) and weekly cleanup of replays >30 days old
- Spec: docs/superpowers/specs/2026-05-08-admin-ai-models-design.md

## Test plan
- [x] Lint + build pass
- [x] Hardcoded fallback works when config table is empty
- [x] Default row applies when use-case row absent
- [x] Use-case row overrides default
- [x] Replay tester returns metrics + validation for valid + invalid candidates
- [x] Recent replays list re-opens results
EOF
)"
```

- [ ] **Step 4: Confirm with Daniel**

Once the PR is open, ping him to review and merge. After merge, rebase the `email-campaigns-plan-2` branch on top of master so the email-drafts use-case keeps working through `resolveModels`:

```bash
git checkout email-campaigns-plan-2
git fetch origin
git rebase origin/master
git push --force-with-lease
```

---

## Self-review notes

- Spec coverage: §5 use-cases → Tasks 5–8. §6 schema → Task 2. §7 resolver → Task 4. §8 prompt builders → existing builders re-used; Task 8 extracts the only one that wasn't (content-ideas). §9 replay execution → Tasks 11–12. §10 pricing → Task 10. §11 admin UI → Tasks 14–16. §13 branching → Task 1, Task 17 step 4. §14 risks (cleanup) → Task 13.
- The plan deliberately re-uses existing prompt builders in `lib/signal-prompt.ts`, `lib/insights-prompt.ts`, and `lib/email-campaigns/generation-prompt.ts` rather than creating new ones in `lib/ai/prompts/` — those are already extracted in the same shape the spec called for, so duplicating them would just create drift. The only new prompt file is `lib/ai/prompts/content-ideas.ts`.
- The resolver is invoked via `internal.aiModels.resolveModelsInternal` (internalQuery wrapper) for Convex actions, and `api.aiModels.resolveModelsPublic` for the Next.js route handler. Both wrap the same `resolveModels` core function.
- `as never` casts in `convex/aiModelReplay.ts` are intentional: the replay accepts string ids from the UI and would otherwise need a generic discriminator that's overkill for an admin-only feature.
