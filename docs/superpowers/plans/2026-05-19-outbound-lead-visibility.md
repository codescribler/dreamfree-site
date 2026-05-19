# Outbound Lead Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide unengaged outbound (API) leads from the admin dashboard and Mission Control API until the recipient clicks through to view their report. Surface engaged-outbound leads in the main feed alongside inbound leads.

**Architecture:** Ship the deferred engagement tracking — new optional fields on `signalReports` (`firstViewedAt`, `viewCount`) and `leads` (`firstEngagedAt`, `lastEngagedAt`, `engagementCount`) plus a `recordEngagement` mutation fired from the existing report verify route. Apply two cheap visibility rules (`lead.leadType !== "outbound" || lead.firstEngagedAt != null`, and `report.createdViaApiKeyId == null || report.firstViewedAt != null`) everywhere that surfaces leads/reports.

**Tech Stack:** Convex (TypeScript backend), Next.js 15 App Router, vitest + convex-test (edge-runtime), Tailwind. Spec: `docs/superpowers/specs/2026-05-18-outbound-lead-visibility-design.md`.

**Branch:** `outbound-lead-visibility` (already checked out; spec already committed).

---

## File map

| Path | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add 5 optional fields. |
| `convex/signalReports.ts` | Modify | New `recordEngagement` mutation + public wrapper. |
| `convex/leads.ts` | Modify | `list` gains `visibility` arg; add `listOutbound`, `countOutbound`. |
| `convex/missionControl.ts` | Modify | Apply visibility filters in `getActivity`; rebuild `leadsReferenced` and `counts` from filtered arrays. |
| `convex/recordEngagement.test.ts` | Create | Tests for the new mutation. |
| `convex/leadsVisibility.test.ts` | Create | Tests for `leads.list` visibility, `listOutbound`, `countOutbound`. |
| `convex/missionControlFiltering.test.ts` | Create | Tests for filtered `getActivity`. |
| `app/api/report/[id]/verify/route.ts` | Modify | Fire `recordEngagement` after a valid GET-link token check. |
| `app/dashboard/page.tsx` | Modify | Use `visibility: "topLevel"`; add `Outbound — Viewed ×N` chip; label `outbound_report_viewed` event. |
| `app/dashboard/api-leads/page.tsx` | Create | New page — filtered list of all outbound leads. |
| `app/dashboard/DashboardNav.tsx` | Modify | Add `API leads (N)` nav entry. |
| `docs/mission-control-api.md` | Modify | Document the visibility filter. |

---

## Task 1: Schema — add engagement-tracking fields

**Files:**
- Modify: `convex/schema.ts:32-54` (the `leads` table) and `convex/schema.ts:89-182` (the `signalReports` table).

No test for this task — schema changes are validated by every later test plus the compiler. We commit as soon as `npx convex dev` is happy.

- [ ] **Step 1: Add `firstViewedAt` and `viewCount` to `signalReports`**

In `convex/schema.ts`, find the `signalReports` table definition. Just before the closing `})` and indexes, add two fields:

```ts
    createdAt: v.number(),
    createdViaApiKeyId: v.optional(v.id("apiKeys")),
    // Engagement tracking — set when a recipient clicks through to view
    // an API-generated report. See Plan 2 of the May 12 signal-report-api spec.
    firstViewedAt: v.optional(v.number()),
    viewCount: v.optional(v.number()),
  })
```

(Keep the existing indexes block beneath this unchanged.)

- [ ] **Step 2: Add `firstEngagedAt`, `lastEngagedAt`, `engagementCount` to `leads`**

Find the `leads` table. Just before its `.index(...)` calls, add three fields:

```ts
    leadType: v.optional(
      v.union(v.literal("inbound"), v.literal("outbound")),
    ),
    consentedAt: v.optional(v.number()),
    // Engagement tracking — mirrors firstViewedAt/viewCount aggregated
    // across the lead's reports. Updated by signalReports.recordEngagement.
    firstEngagedAt: v.optional(v.number()),
    lastEngagedAt: v.optional(v.number()),
    engagementCount: v.optional(v.number()),
  })
```

- [ ] **Step 3: Push schema to dev to confirm it validates**

Run: `npx convex dev --once`
Expected: completes cleanly. No `schema error` output. (If a long-running `convex dev` is already in another terminal, it will hot-reload silently.)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(engagement): add firstViewedAt/viewCount/engagement fields"
```

---

## Task 2: `signalReports.recordEngagement` mutation (TDD)

**Files:**
- Test: `convex/recordEngagement.test.ts`
- Modify: `convex/signalReports.ts` (append the mutation at end of file)

**What it does:** Given a `reportId`, if the report has `createdViaApiKeyId` set: stamp `firstViewedAt`/`viewCount` on the report, mirror onto the lead (`firstEngagedAt`/`lastEngagedAt`/`engagementCount`), and insert an `outbound_report_viewed` event. If the report has no `createdViaApiKeyId` (it's an inbound report), do nothing. Always returns `null` (caller does not need the result; failure is silent so it can never break the verify redirect).

- [ ] **Step 1: Create the test file**

Create `convex/recordEngagement.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  businessImpact: "",
  recommendations: [],
};

const EMPTY_ELEMENTS = {
  character: EMPTY_ELEMENT,
  problem: EMPTY_ELEMENT,
  guide: EMPTY_ELEMENT,
  plan: EMPTY_ELEMENT,
  cta: EMPTY_ELEMENT,
  stakes: EMPTY_ELEMENT,
  transformation: EMPTY_ELEMENT,
};

async function seedApiLeadAndReport(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const apiKeyId = await ctx.db.insert("apiKeys", {
      name: "test key",
      keyHash: "abc",
      createdAt: Date.now(),
    });
    const leadId = await ctx.db.insert("leads", {
      email: "pat@thing.com",
      firstName: "Pat",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      leadType: "outbound",
    });
    const reportId = await ctx.db.insert("signalReports", {
      leadId,
      anonymousId: "",
      url: "https://thing.com",
      customerDescription: "Local plumbers",
      overallScore: 72,
      gruntTest: { pass: true, explanation: "ok" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "success",
      accessLevel: "verified",
      verifyCode: "",
      verifyToken: "tok",
      createdAt: Date.now(),
      createdViaApiKeyId: apiKeyId,
    });
    return { apiKeyId, leadId, reportId };
  });
}

async function seedInboundLeadAndReport(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const leadId = await ctx.db.insert("leads", {
      email: "jane@example.com",
      firstName: "Jane",
      anonymousIds: ["anon-1"],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      leadType: "inbound",
      consentedAt: Date.now(),
    });
    const reportId = await ctx.db.insert("signalReports", {
      leadId,
      anonymousId: "anon-1",
      url: "https://example.com",
      customerDescription: "Anyone",
      overallScore: 60,
      gruntTest: { pass: true, explanation: "ok" },
      elements: EMPTY_ELEMENTS,
      quickWin: "",
      strengths: [],
      fullSummary: "",
      status: "success",
      accessLevel: "public",
      verifyCode: "",
      verifyToken: "tok",
      createdAt: Date.now(),
    });
    return { leadId, reportId };
  });
}

describe("signalReports.recordEngagement", () => {
  test("first view stamps firstViewedAt + firstEngagedAt and emits an event", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedApiLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBeTypeOf("number");
    expect(report?.viewCount).toBe(1);

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBeTypeOf("number");
    expect(lead?.lastEngagedAt).toBeTypeOf("number");
    expect(lead?.engagementCount).toBe(1);

    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId as Id<"leads">))
        .collect(),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("outbound_report_viewed");
    expect(events[0].properties).toMatchObject({ reportId, viewCount: 1 });
  });

  test("repeat view increments counters but does not change firstViewedAt", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedApiLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });
    const reportAfterFirst = await t.run((ctx) => ctx.db.get(reportId));
    const firstViewedAt = reportAfterFirst?.firstViewedAt;
    const leadAfterFirst = await t.run((ctx) => ctx.db.get(leadId));
    const firstEngagedAt = leadAfterFirst?.firstEngagedAt;

    // Tiny delay so lastEngagedAt can differ.
    await new Promise((r) => setTimeout(r, 5));

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBe(firstViewedAt);
    expect(report?.viewCount).toBe(2);

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBe(firstEngagedAt);
    expect(lead?.engagementCount).toBe(2);
    expect(lead?.lastEngagedAt).toBeGreaterThanOrEqual(firstEngagedAt ?? 0);
  });

  test("is a no-op for inbound reports (no createdViaApiKeyId)", async () => {
    const t = convexTest(schema, modules);
    const { leadId, reportId } = await seedInboundLeadAndReport(t);

    await t.mutation(api.signalReports.recordEngagement, { reportId });

    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.firstViewedAt).toBeUndefined();
    expect(report?.viewCount).toBeUndefined();

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead?.firstEngagedAt).toBeUndefined();
    expect(lead?.engagementCount).toBeUndefined();

    const events = await t.run((ctx) =>
      ctx.db
        .query("events")
        .withIndex("by_leadId", (q) => q.eq("leadId", leadId as Id<"leads">))
        .collect(),
    );
    expect(events).toHaveLength(0);
  });

  test("silently ignores a missing reportId", async () => {
    const t = convexTest(schema, modules);
    // A real Convex id is needed; insert a row, get its id, then delete it.
    const reportId = await t.run(async (ctx) => {
      const leadId = await ctx.db.insert("leads", {
        email: "x@x.com",
        anonymousIds: [],
        sources: [],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
      const id = await ctx.db.insert("signalReports", {
        leadId,
        anonymousId: "",
        url: "",
        customerDescription: "",
        overallScore: 0,
        gruntTest: { pass: false, explanation: "" },
        elements: EMPTY_ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    // Should not throw.
    await t.mutation(api.signalReports.recordEngagement, { reportId });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (mutation not defined yet)**

Run: `npx vitest run convex/recordEngagement.test.ts`
Expected: FAIL with messages along the lines of `Could not find public function for 'signalReports:recordEngagement'`.

- [ ] **Step 3: Implement the mutation**

Append to `convex/signalReports.ts` (after the last existing export):

```ts
/**
 * Record a click-through on an API-created report.
 *
 * Stamps firstViewedAt (once) and increments viewCount on the report,
 * mirrors firstEngagedAt/lastEngagedAt/engagementCount onto the lead,
 * and emits an `outbound_report_viewed` event so Mission Control and
 * the admin dashboard surface the engagement.
 *
 * No-op for reports that were not created via the API (no
 * createdViaApiKeyId) and for missing reports — callers fire this
 * inside a redirect hook where exceptions would break navigation, so
 * silent failure is the right shape.
 */
export const recordEngagement = mutation({
  args: { reportId: v.id("signalReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    if (!report.createdViaApiKeyId) return null;

    const now = Date.now();
    const nextViewCount = (report.viewCount ?? 0) + 1;

    await ctx.db.patch(report._id, {
      firstViewedAt: report.firstViewedAt ?? now,
      viewCount: nextViewCount,
    });

    const lead = await ctx.db.get(report.leadId);
    if (lead) {
      await ctx.db.patch(lead._id, {
        firstEngagedAt: lead.firstEngagedAt ?? now,
        lastEngagedAt: now,
        engagementCount: (lead.engagementCount ?? 0) + 1,
      });
    }

    await ctx.db.insert("events", {
      type: "outbound_report_viewed",
      anonymousId: "",
      leadId: report.leadId,
      sessionId: "",
      path: `/report/${report._id}`,
      properties: { reportId: report._id, viewCount: nextViewCount },
      timestamp: now,
    });

    return null;
  },
});
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run convex/recordEngagement.test.ts`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add convex/signalReports.ts convex/recordEngagement.test.ts
git commit -m "feat(engagement): recordEngagement mutation with tests"
```

---

## Task 3: Fire `recordEngagement` from the verify route

**Files:**
- Modify: `app/api/report/[id]/verify/route.ts`

The route already validates the report id, token, and accessLevel. After all those checks succeed, fire the mutation. This is fire-and-await so any failure is logged (Convex client throws), but the mutation itself is no-op on missing/inbound reports, and we keep redirect behaviour the same.

- [ ] **Step 1: Add the engagement call in the GET handler**

Open `app/api/report/[id]/verify/route.ts`. Find the block at lines 44–55 (`// Mark as verified in Convex if still public` through the existing return). Replace it with:

```ts
  // Mark as verified in Convex if still public
  if (report.accessLevel === "public") {
    await convex.mutation(api.signalReports.markVerified, {
      reportId: id as Id<"signalReports">,
    });
  }

  // Record engagement for API-created reports. The mutation is a no-op for
  // inbound reports; we always call it (rather than gating client-side on
  // createdViaApiKeyId) so the source of truth lives server-side.
  try {
    await convex.mutation(api.signalReports.recordEngagement, {
      reportId: id as Id<"signalReports">,
    });
  } catch (err) {
    // Never block the verify redirect on engagement bookkeeping.
    console.error("recordEngagement failed", err);
  }

  // Set verification cookie (allowed in Route Handler)
  const response = NextResponse.redirect(new URL(`/report/${id}`, req.url));
  await setVerificationCookie(id, response);

  return response;
}
```

(The POST handler — code-based verification — is intentionally untouched. Codes are used by the inbound signal-score flow; API-created reports never hit that path.)

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `api.signalReports.recordEngagement` is unknown, Convex hasn't regenerated types — run `npx convex dev --once` first.)

- [ ] **Step 3: Commit**

```bash
git add app/api/report/[id]/verify/route.ts
git commit -m "feat(engagement): fire recordEngagement on report token verify"
```

---

## Task 4: `leads.list` — `visibility` argument (TDD)

**Files:**
- Modify: `convex/leads.ts:124-137` (the `list` query)
- Test: `convex/leadsVisibility.test.ts`

Adds an optional `visibility: "topLevel" | "all"` argument (default `"topLevel"`). When `"topLevel"`: include all inbound leads + outbound leads where `firstEngagedAt != null`. When `"all"`: every lead.

Implementation strategy: fetch a larger sample via the existing `by_createdAt` index, JS-filter, then slice to `limit`. At current lead volumes this is cheap and avoids needing a new compound index. Pattern matches the existing `countByStatus` query (`take(500)` + JS aggregation).

- [ ] **Step 1: Create the test file**

Create `convex/leadsVisibility.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const inboundId = await ctx.db.insert("leads", {
      email: "in@x.com",
      anonymousIds: [],
      sources: ["signal_score"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 30_000,
      leadType: "inbound",
      consentedAt: Date.now() - 30_000,
    });
    const outboundUnengagedId = await ctx.db.insert("leads", {
      email: "outA@x.com",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 20_000,
      leadType: "outbound",
    });
    const outboundEngagedId = await ctx.db.insert("leads", {
      email: "outB@x.com",
      anonymousIds: [],
      sources: ["api_outbound"],
      lastSeenAt: Date.now(),
      createdAt: Date.now() - 10_000,
      leadType: "outbound",
      firstEngagedAt: Date.now() - 5_000,
      lastEngagedAt: Date.now() - 5_000,
      engagementCount: 1,
    });
    return { inboundId, outboundUnengagedId, outboundEngagedId };
  });
}

describe("leads.list visibility", () => {
  test("defaults to topLevel — hides unengaged outbound, keeps engaged", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const rows = await t.query(api.leads.list, {});
    const returned = rows.map((r) => r._id);
    expect(returned).toContain(ids.inboundId);
    expect(returned).toContain(ids.outboundEngagedId);
    expect(returned).not.toContain(ids.outboundUnengagedId);
  });

  test("visibility: 'all' returns every lead", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const rows = await t.query(api.leads.list, { visibility: "all" });
    const returned = rows.map((r) => r._id);
    expect(returned).toContain(ids.inboundId);
    expect(returned).toContain(ids.outboundEngagedId);
    expect(returned).toContain(ids.outboundUnengagedId);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run convex/leadsVisibility.test.ts`
Expected: the first test fails (`returned` will include `outboundUnengagedId`); the second passes only by coincidence since there's nothing filtering. Either way, the new arg validator will reject `visibility: "all"` until we add it.

- [ ] **Step 3: Update the `list` query**

In `convex/leads.ts`, replace the existing `list` query (lines 124–137) with:

```ts
/** List leads, newest first.
 *
 * `visibility`:
 *   - "topLevel" (default) — inbound leads + outbound leads with firstEngagedAt set.
 *   - "all" — every lead, including unengaged outbound.
 *
 * Strategy: fetch a 3× sample by createdAt desc and JS-filter. At current
 * lead volume this is cheaper than a compound index and matches the pattern
 * used by countByStatus.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    visibility: v.optional(
      v.union(v.literal("topLevel"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const visibility = args.visibility ?? "topLevel";

    if (visibility === "all") {
      return await ctx.db
        .query("leads")
        .withIndex("by_createdAt")
        .order("desc")
        .take(limit);
    }

    const sample = await ctx.db
      .query("leads")
      .withIndex("by_createdAt")
      .order("desc")
      .take(Math.max(limit * 3, 200));

    const filtered = sample.filter(
      (l) => l.leadType !== "outbound" || l.firstEngagedAt != null,
    );
    return filtered.slice(0, limit);
  },
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run convex/leadsVisibility.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add convex/leads.ts convex/leadsVisibility.test.ts
git commit -m "feat(leads): visibility filter on leads.list (hides unengaged outbound)"
```

---

## Task 5: `leads.listOutbound` query (TDD)

**Files:**
- Modify: `convex/leads.ts` (append the new query)
- Modify: `convex/leadsVisibility.test.ts` (append a `describe` block)

Returns every outbound lead with — joined — their most recent API-created `signalReport` (most-recently-created), plus the name of the api key that created the report. Each row includes a `viewCount` (0 when unviewed) and a `firstViewedAt` so the UI can sort and label correctly.

- [ ] **Step 1: Append the test**

Append to `convex/leadsVisibility.test.ts`:

```ts
describe("leads.listOutbound", () => {
  test("returns each outbound lead with their latest API report and key name", async () => {
    const t = convexTest(schema, modules);

    const { engagedLeadId, unengagedLeadId } = await t.run(async (ctx) => {
      const keyA = await ctx.db.insert("apiKeys", {
        name: "campaign-A",
        keyHash: "kA",
        createdAt: Date.now(),
      });
      const engagedLeadId = await ctx.db.insert("leads", {
        email: "engaged@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now() - 10_000,
        leadType: "outbound",
        firstEngagedAt: Date.now() - 5_000,
        lastEngagedAt: Date.now() - 5_000,
        engagementCount: 3,
      });
      const unengagedLeadId = await ctx.db.insert("leads", {
        email: "unengaged@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now() - 2_000,
        leadType: "outbound",
      });
      const EMPTY = {
        score: 0,
        summary: "",
        analysis: "",
        businessImpact: "",
        recommendations: [],
      };
      const ELEMENTS = {
        character: EMPTY,
        problem: EMPTY,
        guide: EMPTY,
        plan: EMPTY,
        cta: EMPTY,
        stakes: EMPTY,
        transformation: EMPTY,
      };
      await ctx.db.insert("signalReports", {
        leadId: engagedLeadId,
        anonymousId: "",
        url: "https://engaged.test",
        customerDescription: "x",
        overallScore: 80,
        gruntTest: { pass: true, explanation: "" },
        elements: ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now() - 4_000,
        createdViaApiKeyId: keyA,
        firstViewedAt: Date.now() - 5_000,
        viewCount: 3,
      });
      await ctx.db.insert("signalReports", {
        leadId: unengagedLeadId,
        anonymousId: "",
        url: "https://unengaged.test",
        customerDescription: "y",
        overallScore: 55,
        gruntTest: { pass: false, explanation: "" },
        elements: ELEMENTS,
        quickWin: "",
        strengths: [],
        fullSummary: "",
        status: "success",
        accessLevel: "verified",
        verifyCode: "",
        verifyToken: "",
        createdAt: Date.now() - 1_000,
        createdViaApiKeyId: keyA,
      });
      return { engagedLeadId, unengagedLeadId };
    });

    const rows = await t.query(api.leads.listOutbound, { filter: "all" });
    expect(rows).toHaveLength(2);

    // Engaged sorts first (firstEngagedAt desc nulls last).
    expect(rows[0].lead._id).toBe(engagedLeadId);
    expect(rows[0].report?.url).toBe("https://engaged.test");
    expect(rows[0].report?.viewCount).toBe(3);
    expect(rows[0].apiKeyName).toBe("campaign-A");

    expect(rows[1].lead._id).toBe(unengagedLeadId);
    expect(rows[1].report?.viewCount ?? 0).toBe(0);
  });

  test("filter: 'engaged' / 'pending' narrows correctly", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        email: "eng@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
      await ctx.db.insert("leads", {
        email: "pen@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
    });

    const engaged = await t.query(api.leads.listOutbound, { filter: "engaged" });
    expect(engaged.map((r) => r.lead.email)).toEqual(["eng@x.com"]);

    const pending = await t.query(api.leads.listOutbound, { filter: "pending" });
    expect(pending.map((r) => r.lead.email)).toEqual(["pen@x.com"]);
  });
});

describe("leads.countOutbound", () => {
  test("counts all outbound leads regardless of engagement", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        email: "a@x.com",
        anonymousIds: [],
        sources: ["signal_score"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "inbound",
      });
      await ctx.db.insert("leads", {
        email: "b@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
      });
      await ctx.db.insert("leads", {
        email: "c@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
    });

    const n = await t.query(api.leads.countOutbound, {});
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run convex/leadsVisibility.test.ts`
Expected: the two new tests fail (functions not yet defined).

- [ ] **Step 3: Implement `listOutbound` and `countOutbound`**

Append to `convex/leads.ts`:

```ts
/**
 * List outbound (API-generated) leads with their most-recent API report
 * joined. Engaged rows sort first, then by createdAt desc.
 *
 * Used by the /dashboard/api-leads page. Filter:
 *   - "all" (default): every outbound lead
 *   - "engaged":       firstEngagedAt set
 *   - "pending":       firstEngagedAt not set
 */
export const listOutbound = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("engaged"),
        v.literal("pending"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const filter = args.filter ?? "all";
    const limit = args.limit ?? 200;

    const outbound = await ctx.db
      .query("leads")
      .withIndex("by_leadType", (q) => q.eq("leadType", "outbound"))
      .take(500);

    const narrowed = outbound.filter((l) => {
      if (filter === "engaged") return l.firstEngagedAt != null;
      if (filter === "pending") return l.firstEngagedAt == null;
      return true;
    });

    narrowed.sort((a, b) => {
      const aEng = a.firstEngagedAt;
      const bEng = b.firstEngagedAt;
      if (aEng != null && bEng != null) return bEng - aEng;
      if (aEng != null) return -1;
      if (bEng != null) return 1;
      return b.createdAt - a.createdAt;
    });

    const sliced = narrowed.slice(0, limit);

    return await Promise.all(
      sliced.map(async (lead) => {
        const reports = await ctx.db
          .query("signalReports")
          .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
          .order("desc")
          .take(20);
        const apiReports = reports.filter((r) => r.createdViaApiKeyId != null);
        const report = apiReports[0] ?? null;
        let apiKeyName: string | null = null;
        if (report?.createdViaApiKeyId) {
          const key = await ctx.db.get(report.createdViaApiKeyId);
          apiKeyName = key?.name ?? null;
        }
        return { lead, report, apiKeyName };
      }),
    );
  },
});

/** Count of outbound leads in the system (engaged + unengaged). */
export const countOutbound = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_leadType", (q) => q.eq("leadType", "outbound"))
      .take(2000);
    return rows.length;
  },
});
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run convex/leadsVisibility.test.ts`
Expected: all five tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add convex/leads.ts convex/leadsVisibility.test.ts
git commit -m "feat(leads): listOutbound + countOutbound queries"
```

---

## Task 6: `missionControl.getActivity` — filter outbound noise (TDD)

**Files:**
- Modify: `convex/missionControl.ts:38-125` (the `getActivity` query)
- Test: `convex/missionControlFiltering.test.ts`

Apply the two visibility rules before assembling the response. `counts` reflects the filtered arrays; `leadsReferenced` is built from the filtered arrays only.

- [ ] **Step 1: Create the test file**

Create `convex/missionControlFiltering.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const EMPTY_ELEMENT = {
  score: 0,
  summary: "",
  analysis: "",
  businessImpact: "",
  recommendations: [],
};
const ELEMENTS = {
  character: EMPTY_ELEMENT,
  problem: EMPTY_ELEMENT,
  guide: EMPTY_ELEMENT,
  plan: EMPTY_ELEMENT,
  cta: EMPTY_ELEMENT,
  stakes: EMPTY_ELEMENT,
  transformation: EMPTY_ELEMENT,
};

describe("missionControl.getActivity filtering", () => {
  test("hides unengaged outbound leads + unviewed API reports; keeps engaged ones", async () => {
    const t = convexTest(schema, modules);

    const { inboundLeadId, engagedLeadId, unengagedLeadId, viewedReportId, unviewedReportId } =
      await t.run(async (ctx) => {
        const keyId = await ctx.db.insert("apiKeys", {
          name: "k",
          keyHash: "k",
          createdAt: Date.now(),
        });
        const inboundLeadId = await ctx.db.insert("leads", {
          email: "in@x.com",
          anonymousIds: [],
          sources: ["signal_score"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "inbound",
        });
        const engagedLeadId = await ctx.db.insert("leads", {
          email: "eng@x.com",
          anonymousIds: [],
          sources: ["api_outbound"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "outbound",
          firstEngagedAt: Date.now(),
          engagementCount: 1,
        });
        const unengagedLeadId = await ctx.db.insert("leads", {
          email: "un@x.com",
          anonymousIds: [],
          sources: ["api_outbound"],
          lastSeenAt: Date.now(),
          createdAt: Date.now(),
          leadType: "outbound",
        });
        const baseReport = {
          anonymousId: "",
          url: "https://x",
          customerDescription: "",
          overallScore: 0,
          gruntTest: { pass: false, explanation: "" },
          elements: ELEMENTS,
          quickWin: "",
          strengths: [],
          fullSummary: "",
          status: "success" as const,
          accessLevel: "verified" as const,
          verifyCode: "",
          verifyToken: "",
          createdAt: Date.now(),
          createdViaApiKeyId: keyId,
        };
        const viewedReportId = await ctx.db.insert("signalReports", {
          ...baseReport,
          leadId: engagedLeadId,
          firstViewedAt: Date.now(),
          viewCount: 1,
        });
        const unviewedReportId = await ctx.db.insert("signalReports", {
          ...baseReport,
          leadId: unengagedLeadId,
        });
        return {
          inboundLeadId,
          engagedLeadId,
          unengagedLeadId,
          viewedReportId,
          unviewedReportId,
        };
      });

    const since = Date.now() - 60_000;
    const until = Date.now() + 60_000;
    const result = await t.query(api.missionControl.getActivity, { since, until });

    const leadIds = result.leads.map((l) => l._id);
    expect(leadIds).toContain(inboundLeadId);
    expect(leadIds).toContain(engagedLeadId);
    expect(leadIds).not.toContain(unengagedLeadId);

    const reportIds = result.signalReports.map((r) => r._id);
    expect(reportIds).toContain(viewedReportId);
    expect(reportIds).not.toContain(unviewedReportId);

    expect(result.counts.leads).toBe(result.leads.length);
    expect(result.counts.signalReports).toBe(result.signalReports.length);

    expect(result.leadsReferenced[inboundLeadId]).toBeDefined();
    expect(result.leadsReferenced[engagedLeadId]).toBeDefined();
    expect(result.leadsReferenced[unengagedLeadId as Id<"leads">]).toBeUndefined();
  });

  test("keeps outbound_report_viewed events in the events array", async () => {
    const t = convexTest(schema, modules);
    const { engagedLeadId } = await t.run(async (ctx) => {
      const engagedLeadId = await ctx.db.insert("leads", {
        email: "eng@x.com",
        anonymousIds: [],
        sources: ["api_outbound"],
        lastSeenAt: Date.now(),
        createdAt: Date.now(),
        leadType: "outbound",
        firstEngagedAt: Date.now(),
      });
      await ctx.db.insert("events", {
        type: "outbound_report_viewed",
        anonymousId: "",
        leadId: engagedLeadId,
        sessionId: "",
        path: "/report/x",
        properties: {},
        timestamp: Date.now(),
      });
      return { engagedLeadId };
    });

    const since = Date.now() - 60_000;
    const until = Date.now() + 60_000;
    const result = await t.query(api.missionControl.getActivity, { since, until });

    const types = result.events.map((e) => e.type);
    expect(types).toContain("outbound_report_viewed");
    expect(result.leadsReferenced[engagedLeadId]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run convex/missionControlFiltering.test.ts`
Expected: the first test fails because `unengagedLeadId` and `unviewedReportId` currently appear in the response.

- [ ] **Step 3: Apply the filters in `getActivity`**

Open `convex/missionControl.ts`. Replace the handler body (from `const { since, until } = args;` through the final `};`) with the version below. The Promise.all and `windowQuery` calls stay; everything after gets new filter steps and rebuilt `counts` / `leadsReferenced`.

```ts
  handler: async (ctx, args) => {
    const { since, until } = args;

    const [
      leadsRaw,
      events,
      formSubmissions,
      signalReportsRaw,
      contentPlans,
      callbackRequests,
      demoRequests,
      emailEnrollments,
      emailSends,
      tags,
      leadTags,
    ] = await Promise.all([
      windowQuery(ctx, "leads", since, until),
      windowQuery(ctx, "events", since, until),
      windowQuery(ctx, "formSubmissions", since, until),
      windowQuery(ctx, "signalReports", since, until),
      windowQuery(ctx, "contentPlans", since, until),
      windowQuery(ctx, "callbackRequests", since, until),
      windowQuery(ctx, "demoRequests", since, until),
      windowQuery(ctx, "emailEnrollments", since, until),
      windowQuery(ctx, "emailSends", since, until),
      windowQuery(ctx, "tags", since, until),
      windowQuery(ctx, "leadTags", since, until),
    ]);

    // Visibility filters — see
    // docs/superpowers/specs/2026-05-18-outbound-lead-visibility-design.md
    // A lead is visible if it is inbound, or outbound-and-engaged.
    // An API report is visible if it has been viewed.
    const leads = leadsRaw.filter(
      (l) => l.leadType !== "outbound" || l.firstEngagedAt != null,
    );
    const signalReports = signalReportsRaw.filter(
      (r) => r.createdViaApiKeyId == null || r.firstViewedAt != null,
    );

    const leadIds = new Set<Id<"leads">>();
    const collectLeadId = (r: { leadId?: Id<"leads"> }) => {
      if (r.leadId) leadIds.add(r.leadId);
    };
    formSubmissions.forEach(collectLeadId);
    signalReports.forEach(collectLeadId);
    contentPlans.forEach(collectLeadId);
    callbackRequests.forEach(collectLeadId);
    demoRequests.forEach(collectLeadId);
    emailEnrollments.forEach(collectLeadId);
    emailSends.forEach(collectLeadId);
    leadTags.forEach(collectLeadId);
    events.forEach(collectLeadId);
    leads.forEach((l) => leadIds.add(l._id));

    const leadsReferenced: Record<string, Doc<"leads">> = {};
    await Promise.all(
      Array.from(leadIds).map(async (id) => {
        const doc = await ctx.db.get(id);
        if (!doc) return;
        // Re-apply the visibility rule when resolving — never leak a
        // dropped lead via the join map.
        if (doc.leadType === "outbound" && doc.firstEngagedAt == null) return;
        leadsReferenced[id] = doc;
      }),
    );

    return {
      windowStart: since,
      windowEnd: until,
      counts: {
        leads: leads.length,
        events: events.length,
        formSubmissions: formSubmissions.length,
        signalReports: signalReports.length,
        contentPlans: contentPlans.length,
        callbackRequests: callbackRequests.length,
        demoRequests: demoRequests.length,
        emailEnrollments: emailEnrollments.length,
        emailSends: emailSends.length,
        tags: tags.length,
        leadTags: leadTags.length,
      },
      leads,
      events,
      formSubmissions,
      signalReports,
      contentPlans,
      callbackRequests,
      demoRequests,
      emailEnrollments,
      emailSends,
      tags,
      leadTags,
      leadsReferenced,
    };
  },
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run convex/missionControlFiltering.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Run the full convex test suite to confirm nothing regressed**

Run: `npx vitest run convex/`
Expected: all suites pass. Pay attention to `emailCampaignsTrigger.test.ts` (uses similar fixtures) and `signalReports.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add convex/missionControl.ts convex/missionControlFiltering.test.ts
git commit -m "feat(mission-control): filter unengaged outbound leads and unviewed API reports"
```

---

## Task 7: Dashboard top-level — `Outbound — Viewed ×N` chip + event label

**Files:**
- Modify: `app/dashboard/page.tsx`

The leads table already iterates `lead.sources` for chips. To distinguish engaged outbound leads, render an extra chip *after* the sources chips when `leadType === "outbound" && firstEngagedAt != null`. Also add a label and styling for the new event type.

- [ ] **Step 1: Update `SOURCE_LABELS`, `SOURCE_COLOURS`, and `EVENT_LABELS`**

In `app/dashboard/page.tsx`, replace the three lookup tables at the top of the file with:

```ts
const SOURCE_LABELS: Record<string, string> = {
  course_signup: "Course",
  email_capture: "Newsletter",
  contact_form: "Contact",
  signal_score: "Signal Score",
  api_outbound: "Outbound (API)",
};

const SOURCE_COLOURS: Record<string, string> = {
  course_signup: "bg-purple-100 text-purple-700",
  email_capture: "bg-blue-100 text-blue-700",
  contact_form: "bg-green-100 text-green-700",
  signal_score: "bg-amber-100 text-amber-700",
  api_outbound: "bg-slate-100 text-slate-700",
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Viewed",
  scroll_depth: "Scrolled",
  form_submission: "Submitted",
  signal_score_started: "Started Signal Score",
  signal_score_completed: "Completed Signal Score",
  cta_click: "Clicked CTA",
  outbound_report_viewed: "Opened their report",
};
```

- [ ] **Step 2: Add an `Outbound — Viewed ×N` chip after the sources chips**

Replace the leads-table body row (lines 106–145 — from the opening `leads.map` through its closing `))`) with this version. The only additions are the engagement chip block and the explicit type annotation; the rest is byte-for-byte unchanged.

```tsx
                  leads.map((lead: Doc<"leads">) => {
                    const engaged =
                      lead.leadType === "outbound" &&
                      lead.firstEngagedAt != null;
                    return (
                      <tr
                        key={lead._id}
                        className={`border-b border-border last:border-b-0 hover:bg-warm-grey/30 ${
                          engaged ? "bg-teal/5" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/leads/${lead._id}`}
                            className="font-medium text-charcoal hover:text-teal hover:underline"
                          >
                            {lead.firstName || lead.name || "—"}
                          </Link>
                          <div className="text-xs text-muted">{lead.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {lead.sources.map((src) => (
                              <span
                                key={src}
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOURS[src] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {SOURCE_LABELS[src] ?? src}
                              </span>
                            ))}
                            {engaged ? (
                              <span className="inline-block rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                                Outbound — Viewed ×{lead.engagementCount ?? 1}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-charcoal">
                          {lead.signalScore ? (
                            <span className="font-mono font-semibold">
                              {lead.signalScore}/100
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {timeAgo(lead.createdAt)}
                        </td>
                      </tr>
                    );
                  })
```

The `colSpan` on the empty-state row is still `4`; nothing changed there.

- [ ] **Step 3: Make the `outbound_report_viewed` event card visually distinct**

Replace the recent-activity event-card render (the existing `recentEvents.map(...)` block) with:

```tsx
            recentEvents.map((event: Doc<"events">) => {
              const isClickThrough = event.type === "outbound_report_viewed";
              return (
                <div
                  key={event._id}
                  className={`flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm ${
                    isClickThrough
                      ? "border-teal/40 ring-1 ring-teal/20"
                      : "border-border"
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                      isClickThrough
                        ? "bg-teal/20 text-teal"
                        : "bg-teal/10 text-teal"
                    }`}
                  >
                    {EVENT_LABELS[event.type] ?? event.type}
                  </span>
                  <span className="truncate text-charcoal">{event.path}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
              );
            })
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors. The default `visibility: "topLevel"` on `api.leads.list` means the existing `useQuery(api.leads.list, { limit: 50 })` call already does the right thing — no signature change needed here.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): outbound-viewed chip and click-through event styling"
```

---

## Task 8: New `/dashboard/api-leads` page

**Files:**
- Create: `app/dashboard/api-leads/page.tsx`

A client component that uses the new `listOutbound` query. Filter pills at the top; table beneath.

- [ ] **Step 1: Create the page**

Create `app/dashboard/api-leads/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Filter = "all" | "engaged" | "pending";

function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "engaged", label: "Engaged" },
  { value: "pending", label: "Not yet viewed" },
];

export default function ApiLeadsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useQuery(api.leads.listOutbound, { filter });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">API leads</h1>
        <p className="mt-1 text-sm text-muted">
          Leads created via the Signal Report API. They appear on the main
          dashboard once they click through to view their report.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-teal text-white"
                : "bg-white text-muted ring-1 ring-border hover:text-charcoal"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-warm-grey/50">
                <th className="px-4 py-3 font-semibold text-charcoal">Email</th>
                <th className="px-4 py-3 font-semibold text-charcoal">API key</th>
                <th className="px-4 py-3 font-semibold text-charcoal">URL audited</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Score</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Status</th>
                <th className="px-4 py-3 font-semibold text-charcoal">First viewed</th>
                <th className="px-4 py-3 font-semibold text-charcoal">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows === undefined ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No API leads in this filter.
                  </td>
                </tr>
              ) : (
                rows.map(({ lead, report, apiKeyName }) => {
                  const views = report?.viewCount ?? 0;
                  return (
                    <tr
                      key={lead._id}
                      className="border-b border-border last:border-b-0 hover:bg-warm-grey/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/leads/${lead._id}`}
                          className="font-medium text-charcoal hover:text-teal hover:underline"
                        >
                          {lead.email}
                        </Link>
                        {lead.firstName ? (
                          <div className="text-xs text-muted">{lead.firstName}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{apiKeyName ?? "—"}</td>
                      <td className="px-4 py-3">
                        {report ? (
                          <span className="truncate text-charcoal">
                            {report.url}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-charcoal">
                        {report?.status === "success" ? (
                          <span className="font-mono font-semibold">
                            {report.overallScore}/100
                          </span>
                        ) : (
                          <span className="text-muted">
                            {report?.status ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {views > 0 ? (
                          <span className="inline-block rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                            Viewed ×{views}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Not viewed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {timeAgo(report?.firstViewedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {timeAgo(lead.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders and types check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/api-leads/page.tsx
git commit -m "feat(dashboard): /dashboard/api-leads page for outbound leads"
```

---

## Task 9: Add `API leads (N)` to the dashboard nav

**Files:**
- Modify: `app/dashboard/DashboardNav.tsx`

Static `NAV_ITEMS` becomes a function that returns the items so we can interpolate the live count from `countOutbound`.

- [ ] **Step 1: Replace the file contents**

Replace `app/dashboard/DashboardNav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function DashboardNav() {
  const pathname = usePathname();
  const outboundCount = useQuery(api.leads.countOutbound, {});

  const apiLeadsLabel =
    outboundCount === undefined
      ? "API leads"
      : `API leads (${outboundCount})`;

  const navItems = [
    { href: "/dashboard", label: "Leads" },
    { href: "/dashboard/api-leads", label: apiLeadsLabel },
    { href: "/dashboard/insights", label: "Insights" },
    { href: "/dashboard/email-campaigns", label: "Email Campaigns" },
    { href: "/dashboard/admin/models", label: "AI Models" },
    { href: "/dashboard/admin/api-keys", label: "API Keys" },
  ];

  return (
    <nav className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6">
        {navItems.map((item) => {
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

Note: the `/dashboard` "Leads" link now needs an exact-match active check so it doesn't also light up when on `/dashboard/api-leads`. The existing code already handled this (`item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)`), and the new code keeps that exact check.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/DashboardNav.tsx
git commit -m "feat(dashboard): nav entry for API leads with live count"
```

---

## Task 10: Document the Mission Control filter

**Files:**
- Modify: `docs/mission-control-api.md`

Add a new subsection. Slot it just above `## Examples` so it's logically next to the response shape.

- [ ] **Step 1: Add the new subsection**

Open `docs/mission-control-api.md`. Find the line `## Examples`. Insert the following block immediately before it:

```markdown
## Outbound leads & API-created reports

The endpoint hides activity that has no proven engagement, so the daily brief
reflects acted-on signal rather than queue-fill:

- **`leads`** — outbound leads (those created by `POST /api/v1/signal-reports`)
  are excluded until their recipient clicks through to view their report. An
  outbound lead is "engaged" once `firstEngagedAt` is set.
- **`signalReports`** — API-created reports (rows with `createdViaApiKeyId`)
  are excluded until `firstViewedAt` is set on the report.
- **`leadsReferenced`** — the join map mirrors the filter. Hidden outbound
  leads are not resolvable through this map even if referenced by another
  row, so they cannot leak in indirectly.
- **`events`** — unfiltered. The `outbound_report_viewed` event type is the
  engagement signal; when it appears for a lead, that lead's row and any of
  their API reports become visible from the next window onward.

`counts` always matches the filtered arrays exactly. This is a v1 behaviour
tightening, not a schema change — existing consumers continue to deserialise
without changes.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mission-control-api.md
git commit -m "docs(mission-control): document outbound-lead visibility filter"
```

---

## Task 11: Full sweep + manual smoke test

- [ ] **Step 1: Run all tests one more time**

Run: `npx vitest run`
Expected: every suite passes.

- [ ] **Step 2: Type-check everything**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual smoke — create an unengaged outbound lead**

In one terminal, run `npx convex dev` and `npm run dev` if not already up.

In another terminal, mint an API key (or reuse a dev one) and POST a report:

```bash
curl -s -X POST http://localhost:3000/api/v1/signal-reports \
  -H "Authorization: Bearer $DREAMFREE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","customerDescription":"Local plumbers","email":"smoketest+pending@example.com","firstName":"Smoke"}'
```

Expected response: `{ reportId, status, viewUrl, ... }`.

Open `http://localhost:3000/dashboard` in a logged-in admin browser.
Expected:
- The new lead does **not** appear in the main Leads table.
- The sidebar shows `API leads (N+1)`.
- `http://localhost:3000/dashboard/api-leads` lists the lead with status `Not viewed`.

- [ ] **Step 4: Manual smoke — click through to engage**

Copy the `viewUrl` from the POST response. Open it in a **private/incognito** window (so the verify cookie is fresh).

Expected:
- The report renders.
- Back on `/dashboard`: the lead now appears in the main Leads table with an `Outbound — Viewed ×1` chip; Recent Activity shows an `Opened their report` event with teal accent.
- `/dashboard/api-leads` lists the lead with the `Viewed ×1` pill.
- Reload the `viewUrl` once more. Recent Activity gains a second event; the chip becomes `Outbound — Viewed ×2`.

- [ ] **Step 5: Manual smoke — Mission Control window**

```bash
curl -s -H "Authorization: Bearer $DREAMFREE_KEY" \
  "http://localhost:3000/api/mission-control/activity?since=$(($(date +%s%3N) - 600000))&until=$(date +%s%3N)" \
  | jq '.counts, [.leads[].email], [.signalReports[].url], [.events[].type]'
```

Expected:
- `counts.leads` reflects only the visible leads (the engaged smoke-test lead included).
- `events` contains `"outbound_report_viewed"`.
- The unengaged lead from Step 3 (if you re-run Step 3 with a fresh email afterwards) does not appear in `leads` or `signalReports`.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin outbound-lead-visibility
```

Hand back to Daniel to open the PR.

---

## Self-review notes

- All spec requirements have implementing tasks: schema (1), recordEngagement (2), verify hook (3), leads list filter (4), API leads page support (5), countOutbound (5), MC filter (6), dashboard chip + event label (7), API leads page (8), nav entry (9), doc (10), smoke (11).
- No placeholders: every test, mutation, page, and route handler contains the actual code that will ship.
- Type & name consistency: `recordEngagement`, `listOutbound`, `countOutbound`, `visibility: "topLevel" | "all"`, `filter: "all" | "engaged" | "pending"` — these names are used identically wherever they appear.
- Two known small risks flagged in the spec — engagement hook only firing on the verify route (deliberate), and the dashboard `Sidebar` file actually being `DashboardNav.tsx` — are pinned down in Tasks 3 and 9 respectively.
