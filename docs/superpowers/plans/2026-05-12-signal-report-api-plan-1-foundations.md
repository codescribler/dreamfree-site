# Signal Report API — Plan 1: API Foundations & Outbound Lead Concept

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an authenticated HTTP API for generating Signal Reports from outbound outreach tooling. Reports created via API auto-unlock for the prospect (no email gate), are tagged with the API key that created them, and create leads marked as outbound (no consent). The plan ends with a working `POST /api/v1/signal-reports` + `GET /api/v1/signal-reports/{id}` flow callable via curl, plus an admin page for minting and revoking API keys.

**Architecture:** Two new Next.js Route Handlers under `app/api/v1/signal-reports/`. Bearer-token auth via the existing `apiKeys` Convex table (already has `createKey`, `verifyAndTouch`, `revokeKey`). Lead upsert and report enqueue reuse existing Convex mutations with one new `enqueueReportFromApi` variant that stamps `accessLevel: "verified"` and records the `createdViaApiKeyId`. Site fetch + HTML strip is extracted from `app/api/signal-score/route.ts` into a reusable helper so both entry points share the logic.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Convex (backend, schema), TypeScript, `ConvexHttpClient` from `convex/browser`, Node `crypto` for hashing, `jose` already in deps (used elsewhere).

**Verification model:** This codebase has no automated test suite. Each task ends with a manual verification step — typecheck (`npx tsc --noEmit`), Convex CLI invocations (`npx convex run <fn> '{json}'`), curl commands against `npm run dev`, and Convex/Next dashboard inspection. Where verification needs a real LLM call, dev-environment verification is acceptable.

**Reference spec:** `docs/superpowers/specs/2026-05-12-signal-report-api-design.md`. When this plan is ambiguous, the spec is the source of truth.

**Spec correction:** The spec wrote the URL token query as `?t=<verifyToken>`. The existing verify route uses `?token=<verifyToken>` (`app/api/report/[id]/verify/route.ts`). This plan uses `token` to match existing code. The spec's threat-model arguments are unaffected (the parameter name is not security-relevant).

**Out of scope for this plan (covered in Plan 2):**
- Engagement tracking on report view (`firstViewedAt`, `viewCount`, lead engagement timestamps)
- The `recordEngagement` Convex mutation
- The `df_lead` cookie, `lib/lead-identity*.ts`, `useLeadIdentity()` hook, and form-prefill wiring across the site
- Hooking the verify route to fire engagement
- Mission Control event renderer for `outbound_report_viewed`
- "Hot outbound prospects" dashboard widget
- Lead detail "Engagement" panel
- Email-campaigns enrollment guard against outbound leads
- Per-key reports/prospects counters in the admin keys table (reports count is included; engagement count waits for Plan 2)

This plan ends with a system that creates reports via API and lets Daniel manage keys. Plan 2 adds the engagement and personalisation layer.

---

## Pre-flight

- [ ] **Working tree clean.** Run `git status` and confirm no uncommitted changes other than `.claude/worktrees/`. If anything else is uncommitted, commit or stash first.
- [ ] **Branch.** Confirm you are on `signal-report-api` (where the spec was committed). Run `git branch --show-current` — expected `signal-report-api`.
- [ ] **Convex dev running.** In one terminal, run `npx convex dev` and leave it running for the duration of this plan. Schema and function changes hot-reload.
- [ ] **Next dev running.** In another terminal, run `npm run dev`. Leave it running.
- [ ] **Confirm existing `apiKeys` infra is intact.** Run `npx convex run apiKeys:listKeys '{}'` and verify it returns an array (likely empty `[]`).

---

## Task 1: Schema additions for outbound leads + API attribution

**Files:**
- Modify: `convex/schema.ts`

We add `leadType` + `consentedAt` to `leads`, and `createdViaApiKeyId` to `signalReports`. Engagement-related fields (`firstViewedAt`, `viewCount`, lead engagement timestamps) are deferred to Plan 2.

`leadType` is added as **optional** here so existing rows remain valid until the backfill in Task 2 runs. Plan 2 (or a follow-up cleanup) can tighten it to required if desired; for now optional + a code-level default is enough.

- [ ] **Step 1: Read the current schema** to locate the right blocks.

Run: `npx tsc --noEmit` first to confirm the codebase typechecks cleanly *before* changes (so any later failure is attributable to this plan). Expected: no errors.

Then view `convex/schema.ts` lines 32–50 (the `leads` table) and lines 84–175 (the `signalReports` table).

- [ ] **Step 2: Add fields to `leads`.**

In `convex/schema.ts`, locate the `leads` table definition. Add the four new optional fields directly after `createdAt: v.number(),` and before the closing `})` (i.e. inside the `defineTable({ ... })` object):

```ts
  leads: defineTable({
    email: v.string(),
    firstName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    anonymousIds: v.array(v.string()),
    sources: v.array(v.string()),
    score: v.optional(v.number()),
    signalScore: v.optional(v.number()),
    signalUrl: v.optional(v.string()),
    signalCustomer: v.optional(v.string()),
    lastSeenAt: v.number(),
    createdAt: v.number(),
    leadType: v.optional(
      v.union(v.literal("inbound"), v.literal("outbound")),
    ),
    consentedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"])
    .index("by_lastSeenAt", ["lastSeenAt"])
    .index("by_leadType", ["leadType"]),
```

The new `by_leadType` index supports the leads list filter and the Plan 2 "Hot outbound prospects" widget.

- [ ] **Step 3: Add field to `signalReports`.**

In `convex/schema.ts`, locate the `signalReports` table definition. Add the new optional field directly after `createdAt: v.number(),` and before the closing `})`:

```ts
    createdAt: v.number(),
    createdViaApiKeyId: v.optional(v.id("apiKeys")),
  })
    .index("by_leadId", ["leadId"])
    .index("by_anonymousId", ["anonymousId"])
    .index("by_url", ["url"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"])
    .index("by_createdViaApiKeyId", ["createdViaApiKeyId"]),
```

The new `by_createdViaApiKeyId` index lets the admin keys table show "reports created" per key without a full scan.

- [ ] **Step 4: Watch the Convex dev terminal for hot-reload success.**

Expected: Convex re-pushes the schema with no errors. If you see `Schema validation failed`, the most likely cause is misplaced commas — re-read your edits.

- [ ] **Step 5: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors. The schema changes shouldn't break anything because the new fields are all optional.

- [ ] **Step 6: Commit.**

```bash
git add convex/schema.ts
git commit -m "feat(api): add leadType, consentedAt, createdViaApiKeyId to schema"
```

---

## Task 2: Backfill `leadType` on existing leads

**Files:**
- Create: `convex/migrations.ts`

A one-shot internal mutation to stamp every existing lead as `inbound` and set `consentedAt = createdAt` (because all current leads got there via a form submission, which is the consent moment by design).

- [ ] **Step 1: Create the migrations file.**

Create `convex/migrations.ts` with this content:

```ts
import { internalMutation } from "./_generated/server";

/**
 * One-shot: stamp every existing lead as inbound + set consentedAt = createdAt.
 * Run once after the schema fields are deployed. Safe to re-run (idempotent —
 * skips leads that already have a leadType).
 *
 * Run with: npx convex run migrations:backfillLeadType '{}'
 */
export const backfillLeadType = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    let updated = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (lead.leadType !== undefined) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(lead._id, {
        leadType: "inbound",
        consentedAt: lead.createdAt,
      });
      updated += 1;
    }
    return { total: leads.length, updated, skipped };
  },
});
```

- [ ] **Step 2: Run the backfill.**

Run: `npx convex run migrations:backfillLeadType '{}'`
Expected: returns `{ total: <N>, updated: <N>, skipped: 0 }` on first run. On a re-run: `{ total: <N>, updated: 0, skipped: <N> }`.

- [ ] **Step 3: Spot-check a lead.**

Run: `npx convex run leads:list '{"limit": 1}'`
Expected: the returned lead has `leadType: "inbound"` and `consentedAt: <number>` (matching its `createdAt`).

- [ ] **Step 4: Commit.**

```bash
git add convex/migrations.ts
git commit -m "feat(api): backfill leadType=inbound for existing leads"
```

---

## Task 3: `upsertOutboundLead` mutation + flip-on-form-submit logic

**Files:**
- Modify: `convex/leads.ts`

Two changes:
1. New `upsertOutboundLead` internal mutation — used by the API POST route. Defaults `leadType: "outbound"` on new rows. On an existing row, leaves `leadType` alone.
2. Modify the existing `upsertLead` to flip an outbound lead to inbound + stamp `consentedAt` when called (since all callers of `upsertLead` are form-submission paths).

- [ ] **Step 1: Add `upsertOutboundLead` to `convex/leads.ts`.**

Append to `convex/leads.ts`, after the existing `upsertLeadPublic` block:

```ts
/**
 * Upsert a lead from an outbound API call.
 * On a new row: stamps leadType: "outbound" with no consentedAt.
 * On an existing row: never changes leadType. Adds the API source if missing.
 * Returns the lead ID.
 */
export const upsertOutboundLead = internalMutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"leads">> => {
    const now = Date.now();
    const email = args.email.toLowerCase();
    const existing = await getLeadByEmail(ctx, email);
    const SOURCE = "api_outbound";

    if (existing) {
      const updates: Partial<Doc<"leads">> = { lastSeenAt: now };
      if (args.firstName && !existing.firstName) {
        updates.firstName = args.firstName;
      }
      if (args.phone && !existing.phone) {
        updates.phone = args.phone;
      }
      if (args.website && !existing.website) {
        updates.website = args.website;
      }
      if (!existing.sources.includes(SOURCE)) {
        updates.sources = [...existing.sources, SOURCE];
      }
      // Intentionally do NOT touch leadType — never demote inbound to outbound.
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("leads", {
      email,
      firstName: args.firstName,
      phone: args.phone,
      website: args.website,
      anonymousIds: [],
      sources: [SOURCE],
      lastSeenAt: now,
      createdAt: now,
      leadType: "outbound",
      // consentedAt intentionally undefined — they have not consented.
    });
  },
});
```

- [ ] **Step 2: Modify the existing `upsertLead` to promote outbound → inbound.**

In `convex/leads.ts`, locate the existing `upsertLead` `internalMutation`. Inside the `if (existing) { ... }` branch, immediately before `await ctx.db.patch(existing._id, updates);`, insert this block:

```ts
      // Promote outbound → inbound on first form submission. Never the reverse.
      if (existing.leadType === "outbound") {
        updates.leadType = "inbound";
        updates.consentedAt = now;
      }
```

In the `return await ctx.db.insert("leads", { ... })` block at the end of the same handler, add `leadType: "inbound"` and `consentedAt: now` to the inserted object (just before the closing `})`). Form-path inserts are by definition consent moments. After the change, the insert object should contain (among the existing fields):

```ts
      leadType: "inbound",
      consentedAt: now,
```

- [ ] **Step 3: Add a public wrapper for `upsertOutboundLead`.**

The Next.js POST route uses `ConvexHttpClient` which can't call internal mutations. Add the wrapper after `upsertLeadPublic`:

```ts
/**
 * Public wrapper for upsertOutboundLead — used by the API POST route.
 */
export const upsertOutboundLeadPublic = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"leads">> => {
    return await ctx.runMutation(internal.leads.upsertOutboundLead, args);
  },
});
```

- [ ] **Step 4: Watch Convex hot-reload + typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors. The Convex terminal should show a successful push.

- [ ] **Step 5: Manual verification — outbound creation.**

Run: `npx convex run leads:upsertOutboundLeadPublic '{"email": "outboundtest@example.com", "firstName": "Out", "website": "https://example.com"}'`
Expected: returns a lead ID.

Then: `npx convex run leads:list '{"limit": 5}'`
Expected: `outboundtest@example.com` appears with `leadType: "outbound"` and `consentedAt` undefined.

- [ ] **Step 6: Manual verification — outbound → inbound promotion.**

Trigger an inbound flow against the same email by upserting via the existing public path:
Run: `npx convex run leads:upsertLeadPublic '{"email": "outboundtest@example.com", "firstName": "Out", "source": "test_inbound"}'`
Expected: returns the same lead ID.

Then `npx convex run leads:list '{"limit": 5}'` again.
Expected: `outboundtest@example.com` now has `leadType: "inbound"` and `consentedAt: <number>`. The `sources` array contains both `"api_outbound"` and `"test_inbound"`.

- [ ] **Step 7: Clean up the test lead.**

This row is junk; delete it via the Convex dashboard (Tables → leads → delete the `outboundtest@example.com` row). Or leave it — it's harmless.

- [ ] **Step 8: Commit.**

```bash
git add convex/leads.ts
git commit -m "feat(api): upsertOutboundLead + auto-promote outbound→inbound on form submit"
```

---

## Task 4: Bearer-auth helper

**Files:**
- Create: `lib/api-auth.ts`

Reads the `Authorization: Bearer <key>` header, hashes the raw key, calls `apiKeys.verifyAndTouch`, returns either the validated key context or a `NextResponse` 401. The 401 response body is uniform regardless of whether the header was missing, malformed, or pointed to a revoked key — no information leak about which keys exist.

- [ ] **Step 1: Create the file.**

Create `lib/api-auth.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { createHash } from "crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface ApiAuthContext {
  keyId: Id<"apiKeys">;
  name: string;
}

const UNAUTHORIZED = NextResponse.json(
  { error: "unauthorized" },
  { status: 401 },
);

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Validate the bearer token on an incoming request.
 * Returns either an ApiAuthContext (the key is valid + active) or a
 * NextResponse 401 the route handler should return immediately.
 */
export async function authenticateApiRequest(
  req: NextRequest,
): Promise<ApiAuthContext | NextResponse> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return UNAUTHORIZED;
  }
  const raw = header.slice(7).trim();
  if (!raw) return UNAUTHORIZED;

  const keyHash = hashKey(raw);
  const result = await convex.mutation(api.apiKeys.verifyAndTouch, { keyHash });
  if (!result) return UNAUTHORIZED;

  return { keyId: result.keyId, name: result.name };
}

/** Type guard for routes that prefer a discriminated check. */
export function isAuthFailure(
  v: ApiAuthContext | NextResponse,
): v is NextResponse {
  return v instanceof NextResponse;
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/api-auth.ts
git commit -m "feat(api): bearer-token authentication helper"
```

---

## Task 5: Extract site-fetch + HTML strip into a shared helper

**Files:**
- Create: `lib/site-fetch.ts`
- Modify: `app/api/signal-score/route.ts` (use the helper)

The public `/api/signal-score` route inlines a 50-line site fetch + `stripHtml` + length check. Both that route and the new API POST need the same logic. Extract once, call twice.

- [ ] **Step 1: Create the helper.**

Create `lib/site-fetch.ts`:

```ts
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
```

- [ ] **Step 2: Refactor `app/api/signal-score/route.ts` to use the helper.**

In `app/api/signal-score/route.ts`, replace the section starting at `// 3. Fetch the website HTML` through the end of `// 4. Strip HTML to meaningful content` (roughly lines 195–273) with this:

```ts
  // 3. Fetch the website HTML + strip (shared helper for fast-fail UX)
  const fetchResult = await fetchAndStripSite(url);
  if (!fetchResult.ok) {
    steps.push(`Website fetch FAILED: ${fetchResult.detail}`);
    await convex.mutation(api.signalReports.saveFailedReport, {
      leadId,
      anonymousId,
      url,
      customerDescription,
      status: "fetch_failed",
    });
    await sendRunLogEmail({
      ...logBase,
      steps,
      outcome: "fetch_failed",
      leadId: leadId as string,
      errorDetail: fetchResult.detail,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({
      error: "fetch_failed",
      message:
        "We couldn't reach that website. Please check the URL and try again.",
      usesRemaining: MAX_USES - useCount,
    });
  }
  const strippedContent = fetchResult.strippedContent;
  steps.push(`Website fetched + stripped: ${strippedContent.length} chars`);
```

Add this import at the top of the file alongside the others:

```ts
import { fetchAndStripSite } from "@/lib/site-fetch";
```

Remove the now-unused `stripHtml` import (the helper imports it directly).

- [ ] **Step 3: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification — public Signal Score still works.**

Open `http://localhost:3000/signal-score` in a browser. Submit a real form (use `https://example.com` as the URL — it will fail-fetch in a controlled way, which is fine for verifying the new error path). Confirm the UI shows the "we couldn't reach that website" message and the request returns a 200 with `error: "fetch_failed"` (check Network tab).

Optionally try a real site to confirm the success path still queues a report.

- [ ] **Step 5: Commit.**

```bash
git add lib/site-fetch.ts app/api/signal-score/route.ts
git commit -m "refactor(signal-score): extract fetchAndStripSite to shared helper"
```

---

## Task 6: `enqueueReportFromApi` mutation + `getApiResponse` query

**Files:**
- Modify: `convex/signalReports.ts`

`enqueueReportFromApi` mirrors the existing `enqueueReport` but stamps `accessLevel: "verified"` (so the report viewer skips the email gate) and `createdViaApiKeyId`. It still generates a `verifyToken` so the public viewer URL works.

`getApiResponse` is a query that returns a JSON-serialisable object matching the API's GET response shape — keeps the route handler thin.

- [ ] **Step 1: Add `enqueueReportFromApi`.**

Append to `convex/signalReports.ts`, after the existing `enqueueReport`:

```ts
/**
 * Create a pending API-sourced report and schedule the LLM action.
 * Same flow as enqueueReport but:
 *  - accessLevel starts at "verified" (no email gate for API-created reports)
 *  - createdViaApiKeyId is recorded for admin attribution
 *  - anonymousId is empty (the prospect did not visit the site to trigger this)
 */
export const enqueueReportFromApi = mutation({
  args: {
    leadId: v.id("leads"),
    apiKeyId: v.id("apiKeys"),
    url: v.string(),
    customerDescription: v.string(),
    strippedContent: v.string(),
    firstName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    verifyCode: v.string(),
    verifyToken: v.string(),
  },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: "",
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "pending",
      accessLevel: "verified",
      verifyCode: args.verifyCode,
      verifyToken: args.verifyToken,
      createdAt: Date.now(),
      createdViaApiKeyId: args.apiKeyId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.signalReportsAction.runReportGeneration,
      {
        reportId,
        strippedContent: args.strippedContent,
        customerDescription: args.customerDescription,
        firstName: args.firstName,
        email: args.email,
        phone: args.phone,
        url: args.url,
        anonymousId: "",
        verifyCode: args.verifyCode,
        verifyToken: args.verifyToken,
      },
    );

    return reportId;
  },
});
```

- [ ] **Step 2: Add a `saveFailedApiReport` mutation.**

Used when the site fetch fails on the API path — we still want the failed row visible in the dashboard so Daniel can see what happened.

```ts
/** Save a failed report on the API path (no anonymousId). */
export const saveFailedApiReport = mutation({
  args: {
    leadId: v.id("leads"),
    apiKeyId: v.id("apiKeys"),
    url: v.string(),
    customerDescription: v.string(),
    status: v.union(
      v.literal("fetch_failed"),
      v.literal("llm_failed"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("signalReports", {
      leadId: args.leadId,
      anonymousId: "",
      url: args.url,
      customerDescription: args.customerDescription,
      overallScore: 0,
      gruntTest: { pass: false, explanation: "" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: args.status,
      accessLevel: "verified",
      verifyCode: "",
      verifyToken: "",
      createdAt: Date.now(),
      createdViaApiKeyId: args.apiKeyId,
    });
  },
});
```

- [ ] **Step 3: Add `getApiResponse` query.**

Append to `convex/signalReports.ts`:

```ts
/**
 * Returns the JSON shape served by GET /api/v1/signal-reports/{id}.
 * `report` is populated only on success.
 */
export const getApiResponse = query({
  args: {
    reportId: v.id("signalReports"),
    siteUrl: v.string(), // host part of viewUrl, e.g. "https://dreamfree.co.uk"
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reportId);
    if (!r) return null;

    const viewUrl = `${args.siteUrl}/report/${r._id}?token=${encodeURIComponent(r.verifyToken)}`;

    if (r.status !== "success") {
      return {
        reportId: r._id,
        status: r.status,
        viewUrl,
      };
    }

    return {
      reportId: r._id,
      status: r.status,
      viewUrl,
      report: {
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
```

- [ ] **Step 4: Watch Convex hot-reload + typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit.**

```bash
git add convex/signalReports.ts
git commit -m "feat(api): enqueueReportFromApi + saveFailedApiReport + getApiResponse"
```

---

## Task 7: POST endpoint — `app/api/v1/signal-reports/route.ts`

**Files:**
- Create: `app/api/v1/signal-reports/route.ts`

Validates auth, validates input, upserts the outbound lead, fetches + strips the site, generates verify creds, enqueues the report, returns the response shape. If `wait=true` is passed, polls for up to 25 seconds before returning.

- [ ] **Step 1: Create the route file.**

Create `app/api/v1/signal-reports/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { randomInt, randomBytes } from "crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";
import { fetchAndStripSite } from "@/lib/site-fetch";

export const maxDuration = 30; // covers the 25s long-poll plus overhead

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";

interface CreateBody {
  url?: string;
  customerDescription?: string;
  firstName?: string;
  email?: string;
  phone?: string;
  wait?: boolean;
}

const REQUIRED_FIELDS: (keyof CreateBody)[] = [
  "url",
  "customerDescription",
  "firstName",
  "email",
];

function buildViewUrl(
  reportId: Id<"signalReports">,
  verifyToken: string,
): string {
  return `${SITE_URL}/report/${reportId}?token=${encodeURIComponent(verifyToken)}`;
}

function buildPollUrl(reportId: Id<"signalReports">): string {
  return `${SITE_URL}/api/v1/signal-reports/${reportId}`;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  // 2. Body + validation
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const missing = REQUIRED_FIELDS.filter((f) => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "missing_fields", fields: missing },
      { status: 400 },
    );
  }

  const url = body.url!;
  const customerDescription = body.customerDescription!;
  const firstName = body.firstName!;
  const email = body.email!;
  const phone = body.phone;
  const wait = body.wait === true;

  // 3. Upsert outbound lead
  const leadId = await convex.mutation(api.leads.upsertOutboundLeadPublic, {
    email,
    firstName,
    phone,
    website: url,
  });

  // 4. Fetch + strip site
  const fetchResult = await fetchAndStripSite(url);
  if (!fetchResult.ok) {
    const failedReportId = await convex.mutation(
      api.signalReports.saveFailedApiReport,
      {
        leadId,
        apiKeyId: auth.keyId,
        url,
        customerDescription,
        status: "fetch_failed",
      },
    );
    return NextResponse.json(
      {
        error: "fetch_failed",
        detail: fetchResult.detail,
        reportId: failedReportId,
        viewUrl: buildViewUrl(failedReportId, ""),
      },
      { status: 502 },
    );
  }

  // 5. Generate verify creds + enqueue
  const verifyCode = String(randomInt(100000, 999999));
  const verifyToken = randomBytes(32).toString("base64url");

  const reportId = await convex.mutation(
    api.signalReports.enqueueReportFromApi,
    {
      leadId,
      apiKeyId: auth.keyId,
      url,
      customerDescription,
      strippedContent: fetchResult.strippedContent,
      firstName,
      email,
      phone,
      verifyCode,
      verifyToken,
    },
  );

  const viewUrl = buildViewUrl(reportId, verifyToken);
  const pollUrl = buildPollUrl(reportId);

  // 6. Optional long-poll
  if (wait) {
    const result = await pollUntilReady(reportId, viewUrl);
    return NextResponse.json(result);
  }

  return NextResponse.json({
    reportId,
    status: "pending",
    viewUrl,
    pollUrl,
  });
}

const FIRST_POLL_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 25000;

async function pollUntilReady(
  reportId: Id<"signalReports">,
  viewUrl: string,
) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, FIRST_POLL_DELAY_MS));

  while (Date.now() - start < MAX_WAIT_MS) {
    const r = await convex.query(api.signalReports.getApiResponse, {
      reportId,
      siteUrl: SITE_URL,
    });
    if (r && r.status !== "pending") {
      return { ...r, pollUrl: buildPollUrl(reportId) };
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }

  return {
    reportId,
    status: "pending",
    viewUrl,
    pollUrl: buildPollUrl(reportId),
  };
}
```

The `enqueueReportFromApi` mutation returns `Id<"signalReports">` (Convex auto-generates that type from the schema), so `reportId` flows through the route as a properly-typed branded id without any unsafe casts.

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Mint a key for the manual smoke test.**

Run: `npx convex run apiKeys:createKey '{"name": "smoke-test"}'`
Expected: returns `{ id: "...", key: "<64-hex-chars>" }`. Copy the `key` value.

- [ ] **Step 4: Smoke test the POST endpoint.**

Replace `<KEY>` and `<URL>` below. Use a real reachable URL for the URL field.

```bash
curl -i -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbc.co.uk","customerDescription":"general public consumers of news","firstName":"Smoke","email":"smoke@example.com"}'
```

Expected: HTTP 200 with body like:
```json
{
  "reportId": "...",
  "status": "pending",
  "viewUrl": "http://localhost:3000/report/...?token=...",
  "pollUrl": "http://localhost:3000/api/v1/signal-reports/..."
}
```

(`SITE_URL` falls back to localhost in dev only if `NEXT_PUBLIC_SITE_URL` is unset. If it's set to the production URL, the link will say `https://dreamfree.co.uk` — that's expected, just visit the localhost equivalent for testing.)

- [ ] **Step 5: Smoke test 401.**

```bash
curl -i -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer wrongkey" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbc.co.uk","customerDescription":"x","firstName":"x","email":"x@example.com"}'
```

Expected: HTTP 401 with body `{"error":"unauthorized"}`.

- [ ] **Step 6: Smoke test missing fields.**

```bash
curl -i -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbc.co.uk"}'
```

Expected: HTTP 400 with body `{"error":"missing_fields","fields":["customerDescription","firstName","email"]}`.

- [ ] **Step 7: Verify the report row was created in Convex.**

Run: `npx convex run signalReports:list '{"limit": 3}'`
Expected: the most recent row has `status: "pending"` (will flip to `"success"` once the LLM action completes ~10–30s later), `accessLevel: "verified"`, and `createdViaApiKeyId` matching the smoke-test key id.

- [ ] **Step 8: Commit.**

```bash
git add app/api/v1/signal-reports/route.ts
git commit -m "feat(api): POST /api/v1/signal-reports"
```

---

## Task 8: GET endpoint — `app/api/v1/signal-reports/[id]/route.ts`

**Files:**
- Create: `app/api/v1/signal-reports/[id]/route.ts`

Bearer-auth, look up the report via the new `getApiResponse` query, return JSON. 404 if not found.

- [ ] **Step 1: Create the route file.**

Create `app/api/v1/signal-reports/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authenticateApiRequest, isAuthFailure } from "@/lib/api-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dreamfree.co.uk";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiRequest(req);
  if (isAuthFailure(auth)) return auth;

  const { id } = await params;

  let result;
  try {
    result = await convex.query(api.signalReports.getApiResponse, {
      reportId: id as Id<"signalReports">,
      siteUrl: SITE_URL,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test the GET endpoint.**

Use the `reportId` from Task 7 step 4. Replace `<KEY>` and `<REPORT_ID>`.

```bash
curl -i http://localhost:3000/api/v1/signal-reports/<REPORT_ID> \
  -H "Authorization: Bearer <KEY>"
```

Expected immediately: HTTP 200 with `{ "reportId": "...", "status": "pending" | "success", "viewUrl": "..." }`. Re-run after ~30s and the status should be `"success"` with a populated `report` object containing `overallScore`, `gruntTest`, `elements`, `quickWin`, `strengths`, `fullSummary`.

- [ ] **Step 4: Smoke test 401.**

```bash
curl -i http://localhost:3000/api/v1/signal-reports/<REPORT_ID> \
  -H "Authorization: Bearer wrongkey"
```

Expected: HTTP 401.

- [ ] **Step 5: Smoke test 404.**

```bash
curl -i http://localhost:3000/api/v1/signal-reports/abc123notreal \
  -H "Authorization: Bearer <KEY>"
```

Expected: HTTP 404.

- [ ] **Step 6: Smoke test the `wait=true` path on POST.**

Mint a fresh report with long-poll enabled:

```bash
curl -i -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bbc.co.uk","customerDescription":"general public","firstName":"Smoke","email":"smoke2@example.com","wait":true}'
```

Expected: the request takes 5–25 seconds. If the LLM finishes in time, response includes the full `report` JSON. If it doesn't, response is the same shape as the async path with `status: "pending"`.

- [ ] **Step 7: Verify the report viewer page renders.**

Open the `viewUrl` from any of the above responses in a private browser window. (If the link points at `dreamfree.co.uk`, manually swap the host to `http://localhost:3000`.) Expected: report renders fully (no email gate) once status is `"success"`.

- [ ] **Step 8: Commit.**

```bash
git add app/api/v1/signal-reports/[id]/route.ts
git commit -m "feat(api): GET /api/v1/signal-reports/[id] + verify viewer"
```

---

## Task 9: Per-key reports counter query

**Files:**
- Modify: `convex/apiKeys.ts`

Adds a query that returns each key augmented with the count of reports it has created. Used by the admin keys page in Task 10.

- [ ] **Step 1: Add the query.**

Append to `convex/apiKeys.ts`:

```ts
/**
 * Like listKeys but each row is augmented with reportCount — the number
 * of signalReports rows whose createdViaApiKeyId matches the key.
 */
export const listKeysWithStats = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query("apiKeys").collect();
    const enriched = await Promise.all(
      keys.map(async (k) => {
        const reports = await ctx.db
          .query("signalReports")
          .withIndex("by_createdViaApiKeyId", (q) =>
            q.eq("createdViaApiKeyId", k._id),
          )
          .collect();
        return {
          _id: k._id,
          name: k.name,
          lastCalledAt: k.lastCalledAt,
          revokedAt: k.revokedAt,
          createdAt: k.createdAt,
          reportCount: reports.length,
        };
      }),
    );
    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});
```

- [ ] **Step 2: Typecheck + Convex hot-reload check.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run it.**

Run: `npx convex run apiKeys:listKeysWithStats '{}'`
Expected: an array including the smoke-test key with `reportCount: 2` (or however many you created in Tasks 7–8).

- [ ] **Step 4: Commit.**

```bash
git add convex/apiKeys.ts
git commit -m "feat(api): listKeysWithStats query for admin attribution"
```

---

## Task 10: Admin API Keys page + create-key modal

**Files:**
- Create: `app/dashboard/admin/api-keys/page.tsx`
- Create: `app/dashboard/admin/api-keys/ApiKeysClient.tsx`
- Create: `app/dashboard/admin/api-keys/CreateKeyModal.tsx`

Server page does session check and renders the client component. The client component lists keys (live via Convex `useQuery`), opens a "Create key" modal that calls the `createKey` action, displays the raw key once with a copy button, and offers revoke.

- [ ] **Step 1: Create the server page.**

Create `app/dashboard/admin/api-keys/page.tsx`:

```ts
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { ApiKeysClient } from "./ApiKeysClient";

export default async function ApiKeysPage() {
  const session = await verifySession();
  if (!session) redirect("/sign-in");
  return <ApiKeysClient />;
}
```

- [ ] **Step 2: Create the client component.**

Create `app/dashboard/admin/api-keys/ApiKeysClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CreateKeyModal } from "./CreateKeyModal";

function formatDate(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ApiKeysClient() {
  const keys = useQuery(api.apiKeys.listKeysWithStats);
  const revoke = useMutation(api.apiKeys.revokeKey);
  const [showCreate, setShowCreate] = useState(false);

  async function handleRevoke(id: Id<"apiKeys">, name: string) {
    if (
      !confirm(
        `Revoke API key "${name}"? This cannot be undone — the key will stop working immediately.`,
      )
    ) {
      return;
    }
    await revoke({ id });
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90"
        >
          Create key
        </button>
      </div>

      <p className="mb-6 text-sm text-muted">
        Bearer tokens for the outbound Signal Report API. Use the value once at
        creation — only the SHA-256 hash is stored on the server.
      </p>

      {keys === undefined ? (
        <p>Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted">No keys yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 pr-4 font-medium">Last called</th>
              <th className="py-2 pr-4 font-medium">Reports</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr
                key={k._id}
                className={`border-b border-border ${k.revokedAt ? "opacity-50" : ""}`}
              >
                <td className="py-3 pr-4 font-medium">{k.name}</td>
                <td className="py-3 pr-4">{formatDate(k.createdAt)}</td>
                <td className="py-3 pr-4">{formatDate(k.lastCalledAt)}</td>
                <td className="py-3 pr-4">{k.reportCount}</td>
                <td className="py-3 pr-4">
                  {k.revokedAt ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      Revoked
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right">
                  {!k.revokedAt && (
                    <button
                      onClick={() => handleRevoke(k._id, k.name)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the modal.**

Create `app/dashboard/admin/api-keys/CreateKeyModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const createKey = useAction(api.apiKeys.createKey);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await createKey({ name: name.trim() });
      setRevealed(result.key);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToClipboard() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    if (revealed && !copied) {
      if (
        !confirm(
          "You haven't copied the key yet. It cannot be retrieved again. Close anyway?",
        )
      ) {
        return;
      }
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!revealed ? (
          <form onSubmit={submit}>
            <h2 className="mb-4 text-lg font-semibold">Create API key</h2>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. outreach-script"
              className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm"
              autoFocus
              required
            />
            <p className="mb-4 text-xs text-muted">
              Used to identify the key in the dashboard. Doesn&apos;t affect the
              key value.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Save your key now</h2>
            <p className="mb-4 text-sm text-muted">
              This is the only time you&apos;ll see this value. We only store
              the SHA-256 hash.
            </p>
            <pre className="mb-4 break-all rounded-md bg-gray-100 p-3 font-mono text-xs">
              {revealed}
            </pre>
            <div className="flex justify-end gap-3">
              <button
                onClick={copyToClipboard}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={onClose}
                disabled={!copied}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
              >
                I&apos;ve saved it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification.**

Open `http://localhost:3000/dashboard/admin/api-keys` (sign in if needed). Expected:
- The smoke-test key from Task 7 appears with `reportCount: 2` (or however many).
- "Create key" opens the modal.
- Submitting with name `"plan-test"` shows the raw 64-char hex string.
- Copy button works (clipboard contains the value, button text flips to "Copied ✓").
- "I've saved it" enables only after copy.
- Trying to close before copying triggers the confirm prompt.
- After dismissal, the table updates live (Convex reactivity) to show the new key.
- Revoke confirms then strikes the row through.

- [ ] **Step 6: Commit.**

```bash
git add app/dashboard/admin/api-keys
git commit -m "feat(api): admin page for API key mint/list/revoke"
```

---

## Task 11: Wire the admin page into the dashboard nav

**Files:**
- Modify: `app/dashboard/DashboardNav.tsx`

Add an "API Keys" link to the existing nav.

- [ ] **Step 1: Add the nav entry.**

In `app/dashboard/DashboardNav.tsx`, locate the `NAV_ITEMS` array. Add the new entry after AI Models:

```ts
const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/admin/models", label: "AI Models" },
  { href: "/dashboard/admin/api-keys", label: "API Keys" },
];
```

- [ ] **Step 2: Manual verification.**

Reload `http://localhost:3000/dashboard`. Expected: "API Keys" link appears in the nav, becomes the active style when on `/dashboard/admin/api-keys`.

- [ ] **Step 3: Commit.**

```bash
git add app/dashboard/DashboardNav.tsx
git commit -m "feat(api): add API Keys link to dashboard nav"
```

---

## Task 12: Public API reference doc

**Files:**
- Create: `docs/api.md`

A short, public-facing reference for the API. Mirrors the spec but trimmed to what an external developer needs.

- [ ] **Step 1: Create the doc.**

Create `docs/api.md`:

````markdown
# Dreamfree Signal Report API

Authenticated HTTP API for generating Signal Reports against arbitrary websites.
Reports are returned as both structured JSON and a shareable link the prospect
can open without an email gate.

## Authentication

Every request requires a bearer token:

```
Authorization: Bearer <key>
```

Keys are minted from the Dreamfree dashboard at `/dashboard/admin/api-keys`.
The raw key is shown exactly once at creation — store it immediately. Only the
SHA-256 hash is kept server-side.

A revoked key returns 401 with no further information.

## Create a report

```
POST /api/v1/signal-reports
Content-Type: application/json
```

Request body:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | string | yes | Site to analyse. `https://` is added if missing. |
| `customerDescription` | string | yes | Who the prospect's site is for. Feeds the LLM. |
| `firstName` | string | yes | For the lead record. |
| `email` | string | yes | Keys the lead record. No verification email is sent. |
| `phone` | string | no | Stored on the lead. |
| `wait` | boolean | no | If true, blocks for up to 25s waiting for completion. |

Default response (async):

```json
{
  "reportId": "...",
  "status": "pending",
  "viewUrl": "https://dreamfree.co.uk/report/...?token=...",
  "pollUrl": "https://dreamfree.co.uk/api/v1/signal-reports/..."
}
```

If `wait=true` and generation completes within 25 seconds, the response also
includes the full `report` payload (see GET below).

### Errors

- `401` — missing, malformed, or revoked bearer token. Body: `{"error": "unauthorized"}`.
- `400` — missing required fields. Body: `{"error": "missing_fields", "fields": [...]}`.
- `400` — body was not valid JSON. Body: `{"error": "invalid_json"}`.
- `502` — site fetch failed. The report row is still saved as `fetch_failed` for dashboard visibility. Body: `{"error": "fetch_failed", "detail": "...", "reportId": "...", "viewUrl": "..."}`.

## Get a report

```
GET /api/v1/signal-reports/{id}
```

Pending response:
```json
{ "reportId": "...", "status": "pending", "viewUrl": "..." }
```

Success response:
```json
{
  "reportId": "...",
  "status": "success",
  "viewUrl": "...",
  "report": {
    "url": "https://example.com",
    "customerDescription": "...",
    "overallScore": 6.4,
    "gruntTest": { "pass": true, "explanation": "..." },
    "elements": {
      "character":      { "score": 7, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
      "problem":        { "score": 5, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["..."] },
      "guide":          { "...": "..." },
      "plan":           { "...": "..." },
      "cta":            { "...": "..." },
      "stakes":         { "...": "..." },
      "transformation": { "...": "..." }
    },
    "quickWin": "...",
    "strengths": ["...", "..."],
    "fullSummary": "..."
  }
}
```

Failure response:
```json
{ "reportId": "...", "status": "fetch_failed" | "llm_failed", "viewUrl": "..." }
```

### Errors

- `401` — missing, malformed, or revoked bearer token.
- `404` — unknown report id.

## Polling guidance

Generation typically completes in 10–30 seconds. Recommended poll cadence: first
check after 5 seconds, then every 2 seconds, with a 60-second timeout. The
status will be `pending`, then transition to `success`, `fetch_failed`, or
`llm_failed` exactly once.

## The view link

The `viewUrl` is the human-facing report. It contains the report id and a
256-bit verify token; no leadId, email, or other identifier is in the URL. The
token is per-report — leaking one URL exposes one report only.

Reports created via the API are pre-verified, so the prospect lands on the
unrestricted report immediately.

## Lead handling

Leads created via this API are tagged `outbound` and have no `consentedAt`
stamp. They are excluded from any automated email enrollment. If the prospect
later submits a form on dreamfree.co.uk, their lead is promoted to `inbound`
and the consent timestamp is set.

## Rate limits

None today. A valid key grants unlimited calls. Contact the maintainer if you
need to operate at a scale that warrants per-key throttling.
````

- [ ] **Step 2: Commit.**

```bash
git add docs/api.md
git commit -m "docs(api): add public API reference"
```

---

## Task 13: Final verification + push

- [ ] **Step 1: Full typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint.**

Run: `npm run lint`
Expected: no errors. (Warnings are acceptable, especially the existing exhaustive-deps suppressions in email-campaigns.)

- [ ] **Step 3: End-to-end smoke.**

Mint a fresh key from the admin UI. Use it to:

```bash
curl -s -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.gov.uk","customerDescription":"UK citizens","firstName":"E2E","email":"e2e@example.com"}' | jq
```

Wait ~30 seconds, then GET that report id and confirm `status: "success"` with a populated `report`. Open the `viewUrl` in a browser and confirm the report renders without an email gate.

In the dashboard:
- `/dashboard/admin/api-keys` shows the key with `reportCount: 1` and an updated `lastCalledAt`.
- `/dashboard` (Leads) lists `e2e@example.com` (`leadType` will be visible in raw-row inspection on the Convex dashboard for now — UI surfacing comes in Plan 2).

- [ ] **Step 4: Push the branch.**

```bash
git push -u origin signal-report-api
```

- [ ] **Step 5: Stop and tell Daniel** that Plan 1 is complete and the branch is pushed. Plan 2 (engagement tracking + cookie identity + Mission Control surfacing + form prefill + email-campaigns guard + dashboard widgets) is ready to be written and executed when he's ready.
