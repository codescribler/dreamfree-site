# Admin AI Models — Design Spec

**Date:** 2026-05-08
**Owner:** Daniel Whittaker
**Status:** Approved (pending implementation plan)

## 1. Purpose

Replace hardcoded AI model strings with a runtime-editable config, and add a replay tester so new candidate models can be evaluated against real historic prompts before being promoted to live use.

The feature must ship to production **before** the in-flight `email-campaigns-plan-2` work merges, so it branches off `master`.

## 2. Background

Today the OpenRouter model id is hardcoded in two places:

- `lib/signal-prompt.ts` — `OPENROUTER_MODEL_PRIMARY` / `OPENROUTER_MODEL_FALLBACK`, used by `convex/signalReportsAction.ts`, `convex/signalInsightsAction.ts`, and `app/api/content-ideas/route.ts`.
- `convex/emailCampaignsAction.ts` — local `MODEL_PRIMARY` / `MODEL_FALLBACK` constants.

Both currently resolve to the same models (`google/gemini-2.5-flash` primary, `qwen/qwen3.6-plus` fallback), but they're independently declared.

All AI calls go through OpenRouter's `/api/v1/chat/completions`, so the unit of configuration is just an OpenRouter model slug.

## 3. Goals

1. Edit primary + fallback model per AI use-case from a Convex-backed admin UI; changes take effect on the next AI call.
2. Test a candidate model against a real historic record (replay) and compare it side-by-side with the currently-live model on output, latency, token usage, cost, and validation status.
3. Keep production safe: a missing or empty config table must not break any AI call.

## 4. Non-goals

- No multi-provider abstraction. OpenRouter only.
- No automated A/B traffic-splitting in production.
- No model marketplace UI / no auto-discovery of available OpenRouter models. Model id is free-text.
- No invoice-grade cost accounting. Estimated cost in £ is for guidance only.

## 5. Use cases

The system recognises five named use-cases:

| Use case key | Today's call site |
|---|---|
| `default` | (new — fallback when a specific use-case isn't configured) |
| `signal_reports` | `convex/signalReportsAction.ts` |
| `signal_insights` | `convex/signalInsightsAction.ts` |
| `email_drafts` | `convex/emailCampaignsAction.ts` |
| `content_ideas` | `app/api/content-ideas/route.ts` |

## 6. Data model

### 6.1 `aiModelConfig` table

```ts
aiModelConfig: defineTable({
  useCase: v.string(),           // one of the five keys above
  primary: v.string(),           // OpenRouter model slug
  fallback: v.string(),          // OpenRouter model slug
  updatedAt: v.number(),
  updatedBy: v.optional(v.string()), // admin email
}).index("by_useCase", ["useCase"])
```

One row per configured use-case. A row's absence means "fall through to default; if no default row, fall through to hardcoded constants".

### 6.2 `aiModelPricing` table

Cached OpenRouter pricing, refreshed daily (see §10).

```ts
aiModelPricing: defineTable({
  model: v.string(),                    // OpenRouter model slug
  promptUsdPerMillion: v.number(),
  completionUsdPerMillion: v.number(),
  fetchedAt: v.number(),
}).index("by_model", ["model"])
```

### 6.3 `aiModelReplays` table

Stores recent replay runs so comparisons aren't lost on refresh.

```ts
aiModelReplays: defineTable({
  useCase: v.string(),
  recordId: v.string(),          // id of the source historic record
  candidateModel: v.string(),
  compareModel: v.optional(v.string()),
  results: v.array(v.object({
    model: v.string(),
    output: v.string(),
    latencyMs: v.number(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costGbp: v.optional(v.number()),
    valid: v.boolean(),
    validationError: v.optional(v.string()),
    rawResponse: v.optional(v.any()),
  })),
  runBy: v.string(),             // admin email
  runAt: v.number(),
}).index("by_runAt", ["runAt"])
```

## 7. Resolver

```ts
// convex/aiModels.ts
export async function resolveModels(
  ctx: QueryCtx,
  useCase: UseCase,
): Promise<{ primary: string; fallback: string }>
```

Order of resolution:

1. Row where `useCase === <requested>` → return its `{primary, fallback}`.
2. Row where `useCase === "default"` → return its `{primary, fallback}`.
3. Hardcoded constants from `lib/signal-prompt.ts` (kept as the ultimate safety net).

The hardcoded constants stay in the codebase indefinitely. They're the floor.

## 8. Prompt builders (refactor)

Each existing AI action currently inlines its system + user prompt construction. To enable replay parity, each prompt is extracted into a pure helper:

```
lib/ai/prompts/signal-report.ts     → buildSignalReportPrompt(input)   → {system, user}
lib/ai/prompts/signal-insights.ts   → buildSignalInsightsPrompt(input) → {system, user}
lib/ai/prompts/email-draft.ts       → buildEmailDraftPrompt(input)     → {system, user}
lib/ai/prompts/content-ideas.ts     → buildContentIdeasPrompt(input)   → {system, user}
```

Each helper takes a typed input object and returns `{system, user}`. The existing action code is changed only to call the helper. Prompt strings move verbatim — no edits to the prompts themselves in this project.

The replay runner uses the same helpers, guaranteeing the candidate model sees exactly what production sees.

## 9. Replay execution

`convex/aiModelReplay.ts` exposes:

- `listReplayableRecords(useCase, search?)` — query returning the most recent ~50 records for the given use-case, with name/email search where applicable. Source tables per use-case:
  - `signal_reports` → `signalReports`
  - `signal_insights` → `signalInsights`
  - `email_drafts` → `emailDrafts` (joined to `emailEnrollments` for lead context in the picker)
  - `content_ideas` → not stored historically as records; for this use-case the picker shows recent leads instead and the prompt is rebuilt from the lead's data
- `runReplay({useCase, recordId, candidateModel, compareModel?})` — action that:
  1. Loads the source record.
  2. Builds prompts via the use-case's helper.
  3. Calls OpenRouter for `candidateModel` and `compareModel` in parallel.
  4. Captures `Date.now()` deltas as `latencyMs`, reads `usage` from the OpenRouter response for tokens, computes `costGbp` via the cached pricing table.
  5. Validates output: for use-cases that expect JSON, attempts the same parse the production code does and reports parse errors; for free-text outputs, validation = "non-empty trimmed string".
  6. Inserts the run into `aiModelReplays` and returns the result.

`compareModel` defaults to the currently-live primary for the chosen use-case (resolved via `resolveModels`).

## 10. Pricing & cost calculation

`lib/ai/openrouter-pricing.ts`:

- Internal scheduled action refreshes pricing daily by fetching `https://openrouter.ai/api/v1/models` and storing slug → `{promptUsdPerMillion, completionUsdPerMillion}` in a small `aiModelPricing` table.
- `estimateCostGbp(model, promptTokens, completionTokens)` reads from that table and applies a hardcoded USD→GBP rate (e.g. 0.79). If the model isn't in the pricing table, returns `undefined` and the UI shows "—".

## 11. Admin UI

Routes are gated automatically by the existing middleware (any path under `/dashboard/*` requires `isAdmin: true` in the JWT session cookie).

### 11.1 `/dashboard/admin/models` — Config

Table with one row per use-case. Columns: Use case, Primary model, Fallback model, Updated, Edit.

- Rows for use-cases with no DB row show "(uses default)" in muted text.
- "Edit" expands an inline form: two text inputs (primary, fallback) + Save + Cancel.
- "Reset to default" button on overridden rows deletes the DB row so the use-case falls through to the default row.
- Save → Convex mutation `setModelConfig` → live on next AI call.
- Helper link "Browse OpenRouter models →" opens `https://openrouter.ai/models` in a new tab.

### 11.2 `/dashboard/admin/models/replay` — Replay tester

Form fields:

- **Use case** — dropdown of the four production use-cases (excluding `default`).
- **Source record** — searchable picker showing the last ~50 records for the chosen use-case, searchable by lead name/email where applicable. Selecting a record pins it.
- **Candidate model** — free-text input.
- **Compare against** — free-text input, pre-filled with the currently-live primary for the chosen use-case.
- **Run replay** button.

Result panel (renders after run completes):

- Two side-by-side cards (candidate, compare).
- Each card shows: output (collapsible — pretty-printed JSON for JSON use-cases, plain text otherwise), latency (ms), prompt tokens / completion tokens / estimated £ cost, validation badge (✓ valid / ✗ + error message), "Show raw response" toggle revealing the full OpenRouter response body.

Below the form, a "Recent replays" list shows the last ~20 runs for the current admin (most recent first), each clickable to re-open its result.

### 11.3 Admin nav

A new `app/dashboard/admin/models/layout.tsx` provides a small sub-nav with two tabs: "Config" and "Replay". The existing dashboard nav gets one new top-level link "Admin → Models" placed at the right-hand end of the existing dashboard tab strip, after "Email Campaigns".

## 12. Refactor scope summary

- Add `lib/ai/prompts/*` helpers; move (do not edit) prompt construction from each existing action.
- Add `convex/aiModels.ts` (config CRUD + resolver) and `convex/aiModelReplay.ts` (replay).
- Add `convex/aiModelPricing.ts` (pricing cache + scheduled refresh) and `lib/ai/openrouter-pricing.ts` (cost calc).
- Update `convex/schema.ts`: add `aiModelConfig`, `aiModelReplays`, `aiModelPricing` tables.
- Update each existing action's two-line read of model constants to call `resolveModels(ctx, "<use_case>")` instead.
- Add admin pages under `app/dashboard/admin/models/`.

The hardcoded `OPENROUTER_MODEL_PRIMARY` / `OPENROUTER_MODEL_FALLBACK` and the `MODEL_PRIMARY` / `MODEL_FALLBACK` constants stay; they become the floor of the resolver chain.

## 13. Branching & shipping

- Branch from `master` as `admin-models-config`.
- Implement, test, ship to production.
- After merge, rebase `email-campaigns-plan-2` on top so the email-drafts use-case picks up `resolveModels` automatically.

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Empty/missing config table breaks AI calls | Hardcoded constants remain as ultimate fallback in `resolveModels`. |
| Fat-finger model slug typo takes prod down | OpenRouter returns a clear error → existing fallback path catches it and uses the configured fallback. If both are wrong, the error surfaces in the action's existing logging. |
| Replay storage grows unbounded | `aiModelReplays` is small (text + numbers). A weekly internal cron deletes runs older than 30 days. |
| Pricing data goes stale | Daily scheduled refresh. If fetch fails, last-known pricing keeps being used. Cost is presented as an estimate. |
| Replay reveals real lead data to anyone with admin | All admin routes already require `isAdmin: true`; same surface as the existing dashboard. No new exposure. |

## 15. Out of scope

- Per-environment overrides (staging vs production). Single config table for now.
- Streaming model output in replay. Whole-response only.
- Diffing two outputs character-by-character. Side-by-side rendering only — visual comparison is the user's job.
- Automated quality scoring of candidate outputs. Validation is structural (parses / non-empty), not qualitative.
