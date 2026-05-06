# Email Campaigns — Plan 2: Admin UI & Approval Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daniel can review, edit, regenerate, approve, pause, and stop email sequences in the admin dashboard. Add three pages — overview (kill switch + stats + queues), sequence editor (cadence + briefs + voice), per-enrollment view (drafts editor + actions). Add an Email Campaign section to the lead detail page.

**Architecture:** All new pages live under `/dashboard/email-campaigns/*` and reuse the existing admin auth from `middleware.ts`. Pages are client components using `convex/react`'s `useQuery` / `useMutation` hooks (matching the existing leads dashboard pattern). State changes happen via new mutations on `convex/emailCampaigns.ts`. Regeneration calls a new internal action that wraps Plan 1's `generateSequence`. **No sending happens in this plan** — `approveEnrollment` only sets the enrollment status; the scheduler / Resend integration ships in Plan 3.

**Tech Stack:** Next.js 16 app router, React 19, TailwindCSS 4, Convex (existing dependencies), TypeScript.

**Verification model:** No automated test suite. Each task ends with manual verification in the dev browser at `http://localhost:3000/dashboard/email-campaigns`. Where mutations are involved, verify behaviour both in the UI *and* via `npx convex data <table>` or the inspection queries from Plan 1.

**Reference spec:** `docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md`. When this plan is ambiguous, the spec is the source of truth.

**Out of scope for this plan (covered in Plan 3):**
- The `sendDraft` action and the scheduler chain
- Resend integration, `List-Unsubscribe` headers, webhook handler
- The public `/unsubscribe` page
- Business-hours clamp logic
- Per-enrollment "Pause — they replied" button only marks status; no scheduled sends to cancel yet

This plan ends with a fully usable admin UI where Daniel can review and curate sequences. Plan 3 makes them actually send.

---

## Pre-flight

- [ ] **Working tree clean.** Run `git status`. Confirm only `.claude/settings.local.json` (unrelated) is modified. Stash or commit anything else.
- [ ] **Master is at the merge of Plan 1.** Run `git log --oneline -3`. Top commit should be the Plan 1 merge.
- [ ] **Feature branch.** Run `git checkout -b email-campaigns-plan-2`.
- [ ] **Convex dev.** Make sure `npx convex dev` is running (or run `npx convex dev --once` after each backend task).
- [ ] **Next dev.** Make sure `npm run dev` is running. The browser at `http://localhost:3000` is the verification surface for every UI task.

---

## Task 1: Backend — enrollment & config mutations

**Files:**
- Modify: `convex/emailCampaigns.ts` (append at end)

Adds the small mutations the UI calls directly: kill switch toggle, role gaps editor, four enrollment status changes, draft edit save, manual suppression. None of these schedule sends — that's Plan 3.

- [ ] **Step 1: Append the kill switch + cadence mutations.**

```ts
// ===== Config mutations (used by the overview page kill switch and sequence editor) =====

export const setKillSwitch = mutation({
  args: {
    on: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.query("campaignConfig").first();
    if (!config) {
      throw new Error("campaignConfig row missing — run emailCampaigns:seed first");
    }
    await ctx.db.patch(config._id, {
      // globalKillSwitch true = sending OFF, false = sending ON
      globalKillSwitch: !args.on,
      killSwitchNote: args.note,
      killSwitchUpdatedAt: Date.now(),
    });
  },
});

export const setRoleGaps = mutation({
  args: {
    sequenceId: v.id("emailSequences"),
    roleGaps: v.array(v.number()),
    orientationRespectsBusinessHours: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get(args.sequenceId);
    if (!sequence) throw new Error(`Sequence ${args.sequenceId} not found`);
    if (args.roleGaps.length !== ROLES.length) {
      throw new Error(
        `roleGaps must have ${ROLES.length} entries, got ${args.roleGaps.length}`,
      );
    }
    if (args.roleGaps.some((g) => g < 0 || !Number.isFinite(g))) {
      throw new Error("roleGaps must all be finite non-negative numbers");
    }
    await ctx.db.patch(args.sequenceId, {
      roleGaps: args.roleGaps,
      orientationRespectsBusinessHours:
        args.orientationRespectsBusinessHours ??
        sequence.orientationRespectsBusinessHours,
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Append the enrollment status mutations.**

```ts
// ===== Enrollment status mutations =====

export const approveEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "pending_approval") {
      throw new Error(
        `Cannot approve from status=${enrollment.status} (must be pending_approval)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "approved",
      approvedAt: Date.now(),
    });
    // NB: scheduling of the orientation send happens in Plan 3.
  },
});

export const pauseEnrollment = mutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    reason: v.union(
      v.literal("replied"),
      v.literal("manual"),
    ),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "approved") {
      throw new Error(
        `Cannot pause from status=${enrollment.status} (must be approved)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "paused",
      pausedReason: args.reason,
      pausedAt: Date.now(),
    });
  },
});

export const resumeEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (enrollment.status !== "paused") {
      throw new Error(
        `Cannot resume from status=${enrollment.status} (must be paused)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "approved",
      pausedReason: undefined,
      pausedAt: undefined,
    });
    // NB: re-scheduling of the next pending draft happens in Plan 3.
  },
});

export const stopEnrollment = mutation({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (
      enrollment.status === "completed" ||
      enrollment.status === "stopped" ||
      enrollment.status === "unsubscribed"
    ) {
      throw new Error(
        `Cannot stop from status=${enrollment.status} (already terminal)`,
      );
    }
    await ctx.db.patch(args.enrollmentId, {
      status: "stopped",
      stoppedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Append the draft-edit + manual-suppression mutations.**

```ts
// ===== Draft editing =====

export const saveDraftEdit = mutation({
  args: {
    draftId: v.id("emailDrafts"),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");
    if (draft.status === "sent") {
      throw new Error("Cannot edit a sent draft");
    }

    await ctx.db.patch(args.draftId, {
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      editedByDaniel: true,
      // Edits clear staleness on this draft — the user has explicitly chosen
      // this content. Later drafts get marked stale below.
      isStale: false,
    });

    // Cascade: mark all later drafts in the same enrollment as stale.
    const laterDrafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", draft.enrollmentId),
      )
      .collect();
    for (const later of laterDrafts) {
      if (later.order <= draft.order) continue;
      if (later.status === "sent") continue;
      if (!later.isStale) {
        await ctx.db.patch(later._id, { isStale: true });
      }
    }
  },
});

// ===== Manual suppression (used by the lead detail page) =====

export const suppressEmail = mutation({
  args: {
    email: v.string(),
    note: v.optional(v.string()),
    enrollmentId: v.optional(v.id("emailEnrollments")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) {
      // Idempotent — already suppressed.
      return { alreadySuppressed: true };
    }
    await ctx.db.insert("emailSuppressions", {
      email: args.email,
      reason: "manual",
      suppressedAt: Date.now(),
      enrollmentId: args.enrollmentId,
      note: args.note,
    });
    // If a current enrollment is provided and active, terminate it.
    if (args.enrollmentId) {
      const enrollment = await ctx.db.get(args.enrollmentId);
      if (
        enrollment &&
        enrollment.status !== "completed" &&
        enrollment.status !== "stopped" &&
        enrollment.status !== "unsubscribed"
      ) {
        await ctx.db.patch(args.enrollmentId, {
          status: "unsubscribed",
        });
      }
    }
    return { alreadySuppressed: false };
  },
});
```

- [ ] **Step 4: Push to Convex + typecheck.**

```bash
npx convex dev --once
npx tsc --noEmit
```

Expected: `Convex functions ready!` and no TS errors.

- [ ] **Step 5: Smoke test the kill switch toggle.**

```bash
npx convex run --no-push emailCampaigns:setKillSwitch '{"on":true}'
npx convex run --no-push emailCampaigns:getCampaignConfig '{}'
```

Expected: second call returns the config with `globalKillSwitch: false` (sending ON because we toggled `on: true`). Toggle back:

```bash
npx convex run --no-push emailCampaigns:setKillSwitch '{"on":false,"note":"smoke test"}'
npx convex run --no-push emailCampaigns:getCampaignConfig '{}'
```

Expected: `globalKillSwitch: true`, `killSwitchNote: "smoke test"`.

- [ ] **Step 6: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated
git commit -m "feat(email-campaigns): add config + enrollment + draft edit mutations"
```

---

## Task 2: Backend — regenerate-from-role action

**Files:**
- Modify: `convex/emailCampaigns.ts` (add internal mutation)
- Modify: `convex/emailCampaignsAction.ts` (add internal action)

Reusable regeneration: deletes drafts at and beyond a given role, resets the loop ledger so entries opened/closed by deleted drafts are forgotten, then calls the existing `generateSequence` (which fills from `priorDrafts.length` upward).

Single-draft regen, "regenerate later drafts" after an edit cascade, and "regenerate entire sequence" all reduce to one operation: `regenerateFromRole(enrollmentId, fromOrder)`.

- [ ] **Step 1: Add the internal mutation that prepares the enrollment for regeneration.**

Append to `convex/emailCampaigns.ts`:

```ts
export const prepareRegenerationFromRole = internalMutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    fromOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (args.fromOrder < 0 || args.fromOrder >= ROLES.length) {
      throw new Error(
        `fromOrder must be 0..${ROLES.length - 1}, got ${args.fromOrder}`,
      );
    }

    // Refuse to regenerate any draft that has already been sent.
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", args.enrollmentId),
      )
      .collect();
    const sentBeyond = drafts.find(
      (d) => d.order >= args.fromOrder && d.status === "sent",
    );
    if (sentBeyond) {
      throw new Error(
        `Cannot regenerate from order ${args.fromOrder}: draft ${sentBeyond.role} has already been sent`,
      );
    }

    // Delete drafts at and beyond fromOrder.
    for (const draft of drafts) {
      if (draft.order >= args.fromOrder) {
        await ctx.db.delete(draft._id);
      }
    }

    // Reset loop ledger: drop entries opened at or after fromOrder; for kept
    // entries, clear closedInRole if it was set by a draft we just deleted.
    const ROLE_TO_INDEX = new Map(ROLES.map((r, i) => [r as string, i]));
    const newLedger = enrollment.loopLedger
      .filter((entry) => {
        const openIdx = ROLE_TO_INDEX.get(entry.openedInRole);
        return openIdx !== undefined && openIdx < args.fromOrder;
      })
      .map((entry) => {
        const closeIdx = entry.closedInRole
          ? ROLE_TO_INDEX.get(entry.closedInRole)
          : undefined;
        if (closeIdx !== undefined && closeIdx >= args.fromOrder) {
          return { ...entry, closedInRole: undefined };
        }
        return entry;
      });

    await ctx.db.patch(args.enrollmentId, {
      loopLedger: newLedger,
      // Re-enter the generating state so the UI knows things are in flight.
      status: "generating",
      verificationFlags: undefined,
      generationError: undefined,
    });
  },
});
```

- [ ] **Step 2: Add the action that calls the prep mutation and then runs `generateSequence`.**

Append to `convex/emailCampaignsAction.ts`:

```ts
export const regenerateFromRole = internalAction({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    fromOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.emailCampaigns.prepareRegenerationFromRole,
      { enrollmentId: args.enrollmentId, fromOrder: args.fromOrder },
    );

    // Schedule generateSequence to actually do the LLM work. Scheduling
    // (rather than awaiting) keeps the public-facing mutation that triggered
    // this action snappy from the UI.
    await ctx.scheduler.runAfter(
      0,
      internal.emailCampaignsAction.generateSequence,
      { enrollmentId: args.enrollmentId },
    );
  },
});
```

- [ ] **Step 3: Add a public mutation that triggers the action.**

The UI can't call `internalAction` directly. Add a public mutation that schedules the action.

Append to `convex/emailCampaigns.ts`:

```ts
export const requestRegeneration = mutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    fromOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    if (
      enrollment.status === "completed" ||
      enrollment.status === "stopped" ||
      enrollment.status === "unsubscribed" ||
      enrollment.status === "generating"
    ) {
      throw new Error(
        `Cannot regenerate from status=${enrollment.status}`,
      );
    }
    await ctx.scheduler.runAfter(
      0,
      internal.emailCampaignsAction.regenerateFromRole,
      { enrollmentId: args.enrollmentId, fromOrder: args.fromOrder },
    );
  },
});
```

Add the import for `internal` at the top of `convex/emailCampaigns.ts` if not already there:

```ts
import { internal } from "./_generated/api";
```

- [ ] **Step 4: Push + typecheck.**

```bash
npx convex dev --once
npx tsc --noEmit
```

- [ ] **Step 5: Smoke test the regen against the existing chipperfield enrollment.**

Find your existing `pending_approval` enrollment id from Plan 1's testing:

```bash
npx convex run --no-push emailCampaigns:listEnrollments '{"limit":1}'
```

Trigger a single-draft regen of the offer (last draft, order=6):

```bash
npx convex run --no-push emailCampaigns:requestRegeneration '{"enrollmentId":"<id>","fromOrder":6}'
```

Expected: returns nothing. Watch convex dev logs for one OpenRouter call (since only the offer draft regenerates) plus a verifier call. After ~10s, re-check:

```bash
npx convex run --no-push emailCampaigns:getEnrollmentWithDrafts '{"enrollmentId":"<id>"}' 2>&1 | grep -E '"(role|status|order|verificationFlags)"' | head -25
```

Expected: 7 drafts again, all `status: "draft"`, enrollment back to `pending_approval`. Verifier flags re-populated.

- [ ] **Step 6: Commit.**

```bash
git add convex/emailCampaigns.ts convex/emailCampaignsAction.ts convex/_generated
git commit -m "feat(email-campaigns): add regenerate-from-role action + public trigger"
```

---

## Task 3: Backend — stats and queue queries

**Files:**
- Modify: `convex/emailCampaigns.ts`

The overview page needs aggregate counts and three filtered lists. One query per concern keeps each fast.

- [ ] **Step 1: Add `getCampaignStats` query.**

Append:

```ts
export const getCampaignStats = query({
  args: {},
  handler: async (ctx) => {
    const enrollments = await ctx.db.query("emailEnrollments").collect();
    const sends = await ctx.db.query("emailSends").collect();
    const suppressions = await ctx.db.query("emailSuppressions").collect();

    const counts = {
      generating: 0,
      pending_approval: 0,
      approved: 0,
      paused: 0,
      stopped: 0,
      completed: 0,
      unsubscribed: 0,
      generation_failed: 0,
    };
    let pausedDueToReply = 0;
    for (const e of enrollments) {
      counts[e.status] = (counts[e.status] ?? 0) + 1;
      if (e.status === "paused" && e.pausedReason === "replied") {
        pausedDueToReply += 1;
      }
    }

    const sentTotal = sends.length;
    const opened = sends.filter((s) => s.openedAt !== undefined).length;
    const clicked = sends.filter((s) => s.clickedAt !== undefined).length;

    const unsubscribed = suppressions.filter(
      (s) => s.reason === "unsubscribed",
    ).length;

    return {
      enrollments: counts,
      pausedDueToReply,
      sends: {
        total: sentTotal,
        opened,
        clicked,
        openRatePct: sentTotal > 0 ? (opened / sentTotal) * 100 : 0,
        clickRatePct: sentTotal > 0 ? (clicked / sentTotal) * 100 : 0,
      },
      unsubscribed,
    };
  },
});
```

- [ ] **Step 2: Add `listPendingApproval`, `listActive`, `listRecentSends` queries.**

Append:

```ts
export const listPendingApproval = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    const enrollments = await ctx.db
      .query("emailEnrollments")
      .withIndex("by_status", (q) => q.eq("status", "pending_approval"))
      .order("desc")
      .take(limit);

    // Hydrate with lead + report data + draft summary for each row.
    return await Promise.all(
      enrollments.map(async (e) => {
        const lead = await ctx.db.get(e.leadId);
        const report = await ctx.db.get(e.reportId);
        const drafts = await ctx.db
          .query("emailDrafts")
          .withIndex("by_enrollment", (q) =>
            q.eq("enrollmentId", e._id),
          )
          .collect();
        const staleCount = drafts.filter((d) => d.isStale).length;
        const totalFlags =
          (e.verificationFlags?.voice.length ?? 0) +
          (e.verificationFlags?.loops.length ?? 0) +
          (e.verificationFlags?.cheese.length ?? 0) +
          (e.verificationFlags?.factual.length ?? 0);
        return {
          enrollment: e,
          lead,
          report,
          staleCount,
          totalFlags,
        };
      }),
    );
  },
});

export const listActive = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    const enrollments = await ctx.db
      .query("emailEnrollments")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .order("desc")
      .take(limit);

    return await Promise.all(
      enrollments.map(async (e) => {
        const lead = await ctx.db.get(e.leadId);
        const drafts = await ctx.db
          .query("emailDrafts")
          .withIndex("by_enrollment", (q) =>
            q.eq("enrollmentId", e._id),
          )
          .collect();
        drafts.sort((a, b) => a.order - b.order);
        const sent = drafts.filter((d) => d.status === "sent").length;
        const nextScheduled = drafts.find(
          (d) => d.status === "scheduled",
        );
        return {
          enrollment: e,
          lead,
          sentCount: sent,
          totalDrafts: drafts.length,
          nextScheduled: nextScheduled
            ? {
                role: nextScheduled.role,
                scheduledFor: nextScheduled.scheduledFor,
              }
            : null,
        };
      }),
    );
  },
});

export const listRecentSends = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const sends = await ctx.db
      .query("emailSends")
      .order("desc")
      .take(limit);
    return await Promise.all(
      sends.map(async (s) => {
        const lead = await ctx.db.get(s.leadId);
        return { send: s, lead };
      }),
    );
  },
});
```

- [ ] **Step 3: Push + typecheck.**

```bash
npx convex dev --once
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test.**

```bash
npx convex run --no-push emailCampaigns:getCampaignStats '{}'
```

Expected: object with `enrollments.pending_approval: 1`, all other counts 0 (assuming only the one chipperfield enrollment exists).

```bash
npx convex run --no-push emailCampaigns:listPendingApproval '{}'
```

Expected: array of 1 item with `enrollment`, `lead`, `report`, `staleCount: 0`, `totalFlags: 7` (the stub-voice flags from Plan 1).

- [ ] **Step 5: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated
git commit -m "feat(email-campaigns): add stats and queue queries for overview page"
```

---

## Task 4: Frontend — Email Campaigns nav tab

**Files:**
- Modify: `app/dashboard/DashboardNav.tsx`

Tiny one-line change. Adds the new tab pointing at `/dashboard/email-campaigns`.

- [ ] **Step 1: Update the NAV_ITEMS array.**

Replace the `NAV_ITEMS` constant in `app/dashboard/DashboardNav.tsx` with:

```ts
const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/email-campaigns", label: "Email Campaigns" },
];
```

- [ ] **Step 2: Verify in browser.**

Open `http://localhost:3000/dashboard`. Expected: the nav now has three tabs. Clicking "Email Campaigns" navigates to a 404 — that's expected; we build the page next.

- [ ] **Step 3: Commit.**

```bash
git add app/dashboard/DashboardNav.tsx
git commit -m "feat(email-campaigns): add Email Campaigns tab to dashboard nav"
```

---

## Task 5: Frontend — date/cadence formatting helpers

**Files:**
- Create: `lib/email-campaigns/format.ts`

Pure functions used by every UI component. Centralised so they don't drift across pages.

- [ ] **Step 1: Write the file.**

```ts
// lib/email-campaigns/format.ts

/** "5m ago" / "2h ago" / "3d ago" — matches existing dashboard pattern. */
export function timeAgo(timestamp: number | undefined): string {
  if (timestamp === undefined) return "—";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 0) {
    // Future timestamp — show "in Xm" / "in Xh" / "in Xd"
    return `in ${formatRelativeFuture(-seconds)}`;
  }
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatRelativeFuture(seconds: number): string {
  if (seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** "1 Jun 2026, 14:32" UK style. */
export function formatDate(timestamp: number | undefined): string {
  if (timestamp === undefined) return "—";
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Convert ms gap to a human-readable cadence label. */
export function formatGap(ms: number): string {
  if (ms === 0) return "immediate";
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Parse a free-form cadence input ("2 days", "1d", "3h", "30 min") into ms. */
export function parseGap(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "" || trimmed === "0" || trimmed === "immediate") return 0;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(min|m|hour|hours|h|day|days|d)?$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2] ?? "day";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (unit.startsWith("min") || unit === "m") return Math.round(value * minute);
  if (unit.startsWith("h")) return Math.round(value * hour);
  return Math.round(value * day);
}
```

- [ ] **Step 2: Typecheck.**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit.**

```bash
git add lib/email-campaigns/format.ts
git commit -m "feat(email-campaigns): add UI formatting helpers"
```

---

## Task 6: Frontend — Email Campaigns overview page (kill switch + stats)

**Files:**
- Create: `app/dashboard/email-campaigns/page.tsx`
- Create: `app/dashboard/email-campaigns/KillSwitchPanel.tsx`
- Create: `app/dashboard/email-campaigns/StatsGrid.tsx`

Top of the overview: prominent kill switch toggle, then a stats grid. Queues come in Task 7.

- [ ] **Step 1: Create the page shell.**

```tsx
// app/dashboard/email-campaigns/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { KillSwitchPanel } from "./KillSwitchPanel";
import { StatsGrid } from "./StatsGrid";

export default function EmailCampaignsPage() {
  const config = useQuery(api.emailCampaigns.getCampaignConfig);
  const stats = useQuery(api.emailCampaigns.getCampaignStats);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Email Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Personalised soap-opera sequences triggered by Signal Reports.
        </p>
      </header>

      <KillSwitchPanel config={config ?? null} />
      <StatsGrid stats={stats ?? null} />
    </div>
  );
}
```

- [ ] **Step 2: Create the kill switch panel.**

```tsx
// app/dashboard/email-campaigns/KillSwitchPanel.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/email-campaigns/format";

export function KillSwitchPanel({
  config,
}: {
  config: Doc<"campaignConfig"> | null;
}) {
  const setKillSwitch = useMutation(api.emailCampaigns.setKillSwitch);
  const [busy, setBusy] = useState(false);
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [note, setNote] = useState("");

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        Loading config…
      </div>
    );
  }

  const sendingOn = !config.globalKillSwitch;

  async function turnOn() {
    setBusy(true);
    try {
      await setKillSwitch({ on: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await setKillSwitch({ on: false, note: note || undefined });
      setShowNotePrompt(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-xl border p-5 ${
        sendingOn
          ? "border-green-300 bg-green-50"
          : "border-red-300 bg-red-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-charcoal">
            Sending Status
          </p>
          <p className="mt-1 text-2xl font-bold">
            {sendingOn ? (
              <span className="text-green-700">SENDING IS ON</span>
            ) : (
              <span className="text-red-700">SENDING IS OFF</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {sendingOn ? "Turned on" : "Turned off"} {formatDate(config.killSwitchUpdatedAt)}
            {config.killSwitchNote && !sendingOn && (
              <span className="ml-1">— note: &ldquo;{config.killSwitchNote}&rdquo;</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {sendingOn ? (
            <button
              type="button"
              onClick={() => setShowNotePrompt(true)}
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Turn sending OFF
            </button>
          ) : (
            <button
              type="button"
              onClick={turnOn}
              disabled={busy}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Turn sending ON
            </button>
          )}
        </div>
      </div>

      {showNotePrompt && (
        <div className="mt-4 rounded-lg border border-red-300 bg-white p-3">
          <label className="block text-xs font-semibold text-charcoal">
            Why are you turning sending off? (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. voice still drifting"
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm focus:border-teal focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm OFF
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNotePrompt(false);
                setNote("");
              }}
              className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!sendingOn && (
        <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-800">
          Drafts are still queueing as new Signal Reports come in. They will
          not send to recipients until you flip this back on.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Create the stats grid.**

```tsx
// app/dashboard/email-campaigns/StatsGrid.tsx
"use client";

interface Stats {
  enrollments: {
    generating: number;
    pending_approval: number;
    approved: number;
    paused: number;
    stopped: number;
    completed: number;
    unsubscribed: number;
    generation_failed: number;
  };
  pausedDueToReply: number;
  sends: {
    total: number;
    opened: number;
    clicked: number;
    openRatePct: number;
    clickRatePct: number;
  };
  unsubscribed: number;
}

export function StatsGrid({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        Loading stats…
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">Stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Active sequences" value={stats.enrollments.approved} />
        <Stat
          label="Pending approval"
          value={stats.enrollments.pending_approval}
          highlight={stats.enrollments.pending_approval > 0}
        />
        <Stat label="Generating" value={stats.enrollments.generating} />
        <Stat
          label="Generation failed"
          value={stats.enrollments.generation_failed}
          warning={stats.enrollments.generation_failed > 0}
        />
        <Stat label="Emails sent" value={stats.sends.total} />
        <Stat
          label="Open rate"
          value={`${stats.sends.openRatePct.toFixed(0)}%`}
        />
        <Stat
          label="Click rate"
          value={`${stats.sends.clickRatePct.toFixed(0)}%`}
        />
        <Stat label="Replied (paused)" value={stats.pausedDueToReply} />
        <Stat label="Unsubscribed" value={stats.unsubscribed} />
        <Stat label="Completed" value={stats.enrollments.completed} />
        <Stat label="Stopped" value={stats.enrollments.stopped} />
        <Stat label="Paused" value={stats.enrollments.paused} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  warning,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warning?: boolean;
}) {
  const ring = warning
    ? "border-red-300 bg-red-50"
    : highlight
      ? "border-amber-300 bg-amber-50"
      : "border-border bg-white";
  return (
    <div className={`rounded-xl border ${ring} p-4`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-charcoal">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser.**

Open `http://localhost:3000/dashboard/email-campaigns`. Expected:
- Header "Email Campaigns"
- Big red banner "SENDING IS OFF" (kill switch starts off)
- Stats grid with 1 in "Pending approval" (the chipperfield enrollment), 0s elsewhere

Click "Turn sending ON" → banner flips to green "SENDING IS ON". Refresh — state persists. Click "Turn sending OFF" → note prompt appears → fill in "test" → confirm → red banner with the note shown.

- [ ] **Step 5: Reset kill switch back to OFF for the next tasks.**

Click "Turn sending OFF" again, with no note (or a smoke-test note). The default state for the rest of Plan 2 is OFF — Plan 3 ships sending and will need it OFF until that's wired up.

- [ ] **Step 6: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add overview page with kill switch and stats"
```

---

## Task 7: Frontend — overview page queues

**Files:**
- Modify: `app/dashboard/email-campaigns/page.tsx`
- Create: `app/dashboard/email-campaigns/PendingApprovalQueue.tsx`
- Create: `app/dashboard/email-campaigns/ActiveList.tsx`
- Create: `app/dashboard/email-campaigns/RecentSends.tsx`

Three queue sections below the stats: pending approval (most important — this is your inbox), active enrollments, recent sends.

- [ ] **Step 1: Create the pending approval queue.**

```tsx
// app/dashboard/email-campaigns/PendingApprovalQueue.tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

export function PendingApprovalQueue() {
  const items = useQuery(api.emailCampaigns.listPendingApproval, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Pending approval
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No sequences awaiting approval. New ones land here as Signal
            Reports complete.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              if (!item.lead) return null;
              return (
                <Link
                  key={item.enrollment._id}
                  href={`/dashboard/email-campaigns/enrollments/${item.enrollment._id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-warm-grey/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-charcoal">
                      {item.lead.firstName ?? item.lead.name ?? "—"}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {item.lead.email}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.report?.url ?? "—"}
                      {item.report?.overallScore !== undefined && (
                        <span className="ml-2 font-mono">
                          {item.report.overallScore}/100
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.staleCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {item.staleCount} stale
                      </span>
                    )}
                    {item.totalFlags > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                        {item.totalFlags} flagged
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {timeAgo(item.enrollment.enrolledAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the active list.**

```tsx
// app/dashboard/email-campaigns/ActiveList.tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

export function ActiveList() {
  const items = useQuery(api.emailCampaigns.listActive, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Active enrollments
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No sequences currently sending. Approved sequences will appear here.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              if (!item.lead) return null;
              return (
                <Link
                  key={item.enrollment._id}
                  href={`/dashboard/email-campaigns/enrollments/${item.enrollment._id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-warm-grey/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-charcoal">
                      {item.lead.firstName ?? item.lead.name ?? "—"}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {item.lead.email}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Sent {item.sentCount}/{item.totalDrafts} ·{" "}
                      {item.nextScheduled
                        ? `Next: ${item.nextScheduled.role} ${timeAgo(
                            item.nextScheduled.scheduledFor,
                          )}`
                        : "No upcoming send scheduled"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the recent sends list.**

```tsx
// app/dashboard/email-campaigns/RecentSends.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/email-campaigns/format";

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-blue-100 text-blue-700",
  opened: "bg-green-100 text-green-700",
  clicked: "bg-purple-100 text-purple-700",
  bounced: "bg-red-100 text-red-700",
  complained: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

export function RecentSends() {
  const items = useQuery(api.emailCampaigns.listRecentSends, {});

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-charcoal">
        Recently sent
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {items === undefined ? (
          <p className="px-5 py-6 text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No emails have been sent yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.send._id}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.send.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {item.send.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-charcoal">
                  {item.send.subject}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {item.lead?.email ?? "—"}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {timeAgo(item.send.sentAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire them into the page.**

Replace `app/dashboard/email-campaigns/page.tsx` with:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { KillSwitchPanel } from "./KillSwitchPanel";
import { StatsGrid } from "./StatsGrid";
import { PendingApprovalQueue } from "./PendingApprovalQueue";
import { ActiveList } from "./ActiveList";
import { RecentSends } from "./RecentSends";

export default function EmailCampaignsPage() {
  const config = useQuery(api.emailCampaigns.getCampaignConfig);
  const stats = useQuery(api.emailCampaigns.getCampaignStats);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Email Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Personalised soap-opera sequences triggered by Signal Reports.
        </p>
      </header>

      <KillSwitchPanel config={config ?? null} />
      <StatsGrid stats={stats ?? null} />
      <PendingApprovalQueue />
      <ActiveList />
      <RecentSends />
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser.**

Open `http://localhost:3000/dashboard/email-campaigns`. Expected:
- Pending approval section with the chipperfield enrollment, "7 flagged" badge (the stub-voice flags), clicking the row navigates to `/dashboard/email-campaigns/enrollments/<id>` (404 — built in Task 9).
- Active enrollments: empty state.
- Recently sent: empty state.

- [ ] **Step 6: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add overview queues — pending, active, recent sends"
```

---

## Task 8: Frontend — sequence settings page (cadence editor)

**Files:**
- Create: `app/dashboard/email-campaigns/sequence/page.tsx`
- Create: `app/dashboard/email-campaigns/sequence/SequenceTabs.tsx`
- Create: `app/dashboard/email-campaigns/sequence/CadenceEditor.tsx`
- Modify: `convex/emailCampaigns.ts` (add `getActiveSequence` query)

The sequence page has three tabs (Sequence / Briefs / Voice). This task builds the page shell + the Sequence tab (cadence editor). Briefs and Voice come in Tasks 9 and 10.

- [ ] **Step 1: Add a small backend query that returns the v1 sequence.**

Append to `convex/emailCampaigns.ts`:

```ts
export const getActiveSequence = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("emailSequences")
      .withIndex("by_trigger", (q) =>
        q.eq("trigger", "signal_report_success"),
      )
      .first();
  },
});
```

Push and typecheck:

```bash
npx convex dev --once
npx tsc --noEmit
```

- [ ] **Step 2: Create the tab strip.**

```tsx
// app/dashboard/email-campaigns/sequence/SequenceTabs.tsx
"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

const TABS = [
  { key: "sequence", label: "Sequence" },
  { key: "briefs", label: "Briefs" },
  { key: "voice", label: "Voice spec" },
];

export type SequenceTab = "sequence" | "briefs" | "voice";

export function SequenceTabs({ active }: { active: SequenceTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setTab(tab: string) {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <nav className="border-b border-border">
      <div className="flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 py-2 text-sm font-medium transition ${
              active === t.key
                ? "border-teal text-teal"
                : "border-transparent text-muted hover:text-charcoal"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create the cadence editor.**

```tsx
// app/dashboard/email-campaigns/sequence/CadenceEditor.tsx
"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ROLES, ROLE_LABELS } from "@/lib/email-campaigns/roles";
import { formatGap, parseGap } from "@/lib/email-campaigns/format";

export function CadenceEditor({
  sequence,
}: {
  sequence: Doc<"emailSequences">;
}) {
  const setRoleGaps = useMutation(api.emailCampaigns.setRoleGaps);
  const [drafts, setDrafts] = useState<string[]>(
    sequence.roleGaps.map((g) => formatGap(g)),
  );
  const [orientationBH, setOrientationBH] = useState(
    sequence.orientationRespectsBusinessHours,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync if the upstream record changes (someone else edited).
  useEffect(() => {
    setDrafts(sequence.roleGaps.map((g) => formatGap(g)));
    setOrientationBH(sequence.orientationRespectsBusinessHours);
  }, [sequence._id, sequence.roleGaps, sequence.orientationRespectsBusinessHours]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const parsed: number[] = [];
      for (const [i, raw] of drafts.entries()) {
        const ms = parseGap(raw);
        if (ms === null) {
          throw new Error(
            `Cannot parse "${raw}" for ${ROLE_LABELS[ROLES[i]]}. Try "1 day", "2h", or "30 min".`,
          );
        }
        parsed.push(ms);
      }
      if (parsed[0] !== 0) {
        throw new Error(
          "Orientation cadence must be 0 (it sends shortly after trigger). Set the gap to 0 or 'immediate'.",
        );
      }
      await setRoleGaps({
        sequenceId: sequence._id,
        roleGaps: parsed,
        orientationRespectsBusinessHours: orientationBH,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-charcoal">Cadence</h3>
        <p className="mt-1 text-sm text-muted">
          Each gap is the wait between the previous email and this one. Use
          formats like &ldquo;1 day&rdquo;, &ldquo;2h&rdquo;, &ldquo;30 min&rdquo;, or &ldquo;0&rdquo; for immediate.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-warm-grey/50 text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Wait after previous</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role, i) => (
              <tr key={role} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-mono text-charcoal">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-charcoal">
                  {ROLE_LABELS[role]}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={drafts[i]}
                    onChange={(e) => {
                      const next = drafts.slice();
                      next[i] = e.target.value;
                      setDrafts(next);
                    }}
                    disabled={i === 0}
                    className="w-32 rounded-md border border-border bg-white px-2 py-1 text-sm focus:border-teal focus:outline-none disabled:bg-warm-grey disabled:text-muted"
                  />
                  {i === 0 && (
                    <span className="ml-2 text-xs text-muted">
                      (orientation always immediate; tweak business hours below)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={orientationBH}
          onChange={(e) => setOrientationBH(e.target.checked)}
          className="h-4 w-4 rounded border-border text-teal focus:ring-teal"
        />
        Orientation email respects business hours (otherwise it fires
        immediately on approval — even at 3am)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save cadence"}
        </button>
        {saved && (
          <span className="text-xs text-green-700">Saved.</span>
        )}
        {error && (
          <span className="text-xs text-red-700">{error}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the page.**

```tsx
// app/dashboard/email-campaigns/sequence/page.tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SequenceTabs, type SequenceTab } from "./SequenceTabs";
import { CadenceEditor } from "./CadenceEditor";

function SequencePageInner() {
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "sequence") as SequenceTab;
  const sequence = useQuery(api.emailCampaigns.getActiveSequence);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Sequence settings</h1>
        <p className="mt-1 text-sm text-muted">
          Edit cadence, briefs, and voice spec for the Signal Report soap opera.
        </p>
      </header>

      <SequenceTabs active={tab} />

      {tab === "sequence" && (
        sequence === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : sequence === null ? (
          <p className="text-sm text-red-700">No active sequence found. Run seed.</p>
        ) : (
          <CadenceEditor sequence={sequence} />
        )
      )}

      {tab === "briefs" && (
        <p className="text-sm text-muted">Briefs editor — see Task 9.</p>
      )}

      {tab === "voice" && (
        <p className="text-sm text-muted">Voice spec editor — see Task 10.</p>
      )}
    </div>
  );
}

export default function SequencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SequencePageInner />
    </Suspense>
  );
}
```

- [ ] **Step 5: Verify in browser.**

Navigate to `http://localhost:3000/dashboard/email-campaigns/sequence`. Expected:
- Three tabs (Sequence / Briefs / Voice spec)
- "Sequence" active, cadence table with 7 rows
- Orientation row disabled, others editable
- Default values: immediate, 1 day, 1 day, 2 days, 2 days, 3 days, 3 days

Edit the offer (last row) to "5 days" and click "Save cadence". Reload — value persists.

Click "Briefs" tab — URL changes to `?tab=briefs`, body shows the Task 9 stub. Same for Voice spec.

- [ ] **Step 6: Restore default cadence.**

Change the offer back to "3 days" and save (so the rest of Plan 2 + Plan 3 use the default).

- [ ] **Step 7: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add sequence settings page with cadence editor"
```

---

## Task 9: Frontend — briefs editor

**Files:**
- Modify: `app/dashboard/email-campaigns/sequence/page.tsx`
- Create: `app/dashboard/email-campaigns/sequence/BriefsEditor.tsx`
- Modify: `convex/emailCampaigns.ts` (add `countStaleDraftsForBriefs` query)

Sidebar with the 7 roles, click one to load the form. Save creates a new versioned brief and stale-flags later drafts in pending/approved enrollments.

- [ ] **Step 1: Add a query that returns stale-draft counts per role for the active sequence.**

Append to `convex/emailCampaigns.ts`:

```ts
export const countStaleDraftsByRole = query({
  args: { sequenceId: v.id("emailSequences") },
  handler: async (ctx, args) => {
    // Get pending/approved enrollments for this sequence.
    const all = await ctx.db.query("emailEnrollments").collect();
    const targets = all.filter(
      (e) =>
        e.sequenceId === args.sequenceId &&
        (e.status === "pending_approval" || e.status === "approved"),
    );
    const counts: Record<string, number> = {};
    for (const role of ROLES) counts[role] = 0;
    for (const enrollment of targets) {
      const drafts = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", enrollment._id),
        )
        .collect();
      for (const d of drafts) {
        if (d.isStale) counts[d.role] = (counts[d.role] ?? 0) + 1;
      }
    }
    return counts;
  },
});
```

Push + typecheck.

- [ ] **Step 2: Create the briefs editor component.**

```tsx
// app/dashboard/email-campaigns/sequence/BriefsEditor.tsx
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";

const FIELDS: Array<{
  key: keyof Pick<
    Doc<"emailRoleBriefs">,
    | "purpose"
    | "requiredBeats"
    | "loopsToOpen"
    | "loopsToClose"
    | "tone"
    | "lengthGuide"
    | "workedExample"
  >;
  label: string;
  rows: number;
}> = [
  { key: "purpose", label: "Purpose", rows: 3 },
  { key: "requiredBeats", label: "Required beats", rows: 4 },
  { key: "loopsToOpen", label: "Loops to open", rows: 3 },
  { key: "loopsToClose", label: "Loops to close", rows: 2 },
  { key: "tone", label: "Tone", rows: 2 },
  { key: "lengthGuide", label: "Length guide", rows: 1 },
  { key: "workedExample", label: "Worked example (anchor for the LLM)", rows: 12 },
];

export function BriefsEditor({
  sequenceId,
}: {
  sequenceId: Id<"emailSequences">;
}) {
  const [activeRole, setActiveRole] = useState<Role>("orientation");
  const briefs = useQuery(api.emailCampaigns.getCurrentBriefs, { sequenceId });
  const staleCounts = useQuery(api.emailCampaigns.countStaleDraftsByRole, {
    sequenceId,
  });

  const activeBrief = briefs?.find((b) => b.role === activeRole) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <ul className="space-y-1">
          {ROLES.map((role, i) => {
            const stale = staleCounts?.[role] ?? 0;
            return (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                    role === activeRole
                      ? "bg-teal/10 font-semibold text-teal"
                      : "text-charcoal hover:bg-warm-grey"
                  }`}
                >
                  <span>
                    <span className="mr-2 text-xs text-muted">{i + 1}</span>
                    {ROLE_LABELS[role]}
                  </span>
                  {stale > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {stale}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div>
        {briefs === undefined ? (
          <p className="text-sm text-muted">Loading briefs…</p>
        ) : activeBrief === null ? (
          <p className="text-sm text-red-700">No brief found for {activeRole}.</p>
        ) : (
          <BriefForm key={activeBrief._id} brief={activeBrief} />
        )}
      </div>
    </div>
  );
}

function BriefForm({ brief }: { brief: Doc<"emailRoleBriefs"> }) {
  const saveBrief = useMutation(api.emailCampaigns.saveBrief);
  const [values, setValues] = useState({
    purpose: brief.purpose,
    requiredBeats: brief.requiredBeats,
    loopsToOpen: brief.loopsToOpen,
    loopsToClose: brief.loopsToClose,
    tone: brief.tone,
    lengthGuide: brief.lengthGuide,
    workedExample: brief.workedExample,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync when a different brief is loaded into the same form.
  useEffect(() => {
    setValues({
      purpose: brief.purpose,
      requiredBeats: brief.requiredBeats,
      loopsToOpen: brief.loopsToOpen,
      loopsToClose: brief.loopsToClose,
      tone: brief.tone,
      lengthGuide: brief.lengthGuide,
      workedExample: brief.workedExample,
    });
    setSaved(false);
  }, [brief._id, brief.version]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveBrief({
        sequenceId: brief.sequenceId,
        role: brief.role,
        ...values,
        editorEmail: "daniel@dreamfree.co.uk",
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-charcoal">
            {brief.role} (v{brief.version})
          </h3>
          <p className="mt-1 text-xs text-muted">
            Saving creates a new version. Existing pending/approved drafts using
            older versions get marked stale.
          </p>
        </div>
      </div>

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            {field.label}
          </label>
          <textarea
            value={values[field.key]}
            onChange={(e) =>
              setValues({ ...values, [field.key]: e.target.value })
            }
            rows={field.rows}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
          />
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save brief (new version)"}
        </button>
        {saved && <span className="text-xs text-green-700">Saved.</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page.**

In `app/dashboard/email-campaigns/sequence/page.tsx`, replace the briefs stub:

```tsx
{tab === "briefs" && (
  sequence === undefined ? (
    <p className="text-sm text-muted">Loading…</p>
  ) : sequence === null ? (
    <p className="text-sm text-red-700">No active sequence found.</p>
  ) : (
    <BriefsEditor sequenceId={sequence._id} />
  )
)}
```

Add the import at the top:

```tsx
import { BriefsEditor } from "./BriefsEditor";
```

- [ ] **Step 4: Verify in browser.**

`http://localhost:3000/dashboard/email-campaigns/sequence?tab=briefs`. Expected:
- Sidebar with 7 roles, "orientation" highlighted
- Form with the seeded skeleton fields populated
- Click "backstory" — sidebar selection moves, form swaps content
- Edit "purpose" of orientation, click Save → "Saved." appears
- Sidebar should now show "1" badge next to orientation (the chipperfield draft is now stale because it was generated against v1, not v2)

- [ ] **Step 5: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add briefs editor with versioning + stale counts"
```

---

## Task 10: Frontend — voice spec editor

**Files:**
- Modify: `app/dashboard/email-campaigns/sequence/page.tsx`
- Create: `app/dashboard/email-campaigns/sequence/VoiceEditor.tsx`
- Modify: `convex/emailCampaigns.ts` (add `countStaleDraftsAll` query)

Single big textarea for the voice spec. Save creates a new version + stale-flags affected drafts.

- [ ] **Step 1: Add a `countStaleDraftsAll` query.**

Append:

```ts
export const countStaleDraftsAll = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("emailEnrollments").collect();
    const targets = all.filter(
      (e) =>
        e.status === "pending_approval" || e.status === "approved",
    );
    let count = 0;
    for (const enrollment of targets) {
      const drafts = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", enrollment._id),
        )
        .collect();
      count += drafts.filter((d) => d.isStale).length;
    }
    return count;
  },
});
```

Push + typecheck.

- [ ] **Step 2: Create the voice editor component.**

```tsx
// app/dashboard/email-campaigns/sequence/VoiceEditor.tsx
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/email-campaigns/format";
import { VOICE_SPEC_STUB_MARKER } from "@/lib/email-campaigns/roles";

export function VoiceEditor() {
  const current = useQuery(api.emailCampaigns.getCurrentVoiceSpec);
  const staleCount = useQuery(api.emailCampaigns.countStaleDraftsAll);
  const save = useMutation(api.emailCampaigns.saveVoiceSpec);

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current) {
      setBody(current.body);
      setSaved(false);
    }
  }, [current?._id, current?.version]);

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await save({ body, editorEmail: "daniel@dreamfree.co.uk" });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (current === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (current === null) {
    return <p className="text-sm text-red-700">No voice spec found. Run seed.</p>;
  }

  const isStub = body.includes(VOICE_SPEC_STUB_MARKER);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-charcoal">
          Voice spec (v{current.version})
        </h3>
        <p className="mt-1 text-xs text-muted">
          Last updated {formatDate(current.createdAt)} by {current.createdBy}.
          Saving creates a new version. Existing pending/approved drafts get
          marked stale.
          {staleCount !== undefined && staleCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {staleCount} stale drafts in flight
            </span>
          )}
        </p>
      </div>

      {isStub && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The voice spec contains the stub marker{" "}
          <code className="rounded bg-white/70 px-1 py-0.5 text-xs font-mono">
            {VOICE_SPEC_STUB_MARKER}
          </code>
          . While this is present, the verifier flags every draft as
          voice-failed. Replace the stub before approving any sequence.
        </p>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={28}
        className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm focus:border-teal focus:outline-none"
        spellCheck={false}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || body === current.body}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save voice spec (new version)"}
        </button>
        {saved && <span className="text-xs text-green-700">Saved.</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into the page.**

In `app/dashboard/email-campaigns/sequence/page.tsx`, replace the voice stub:

```tsx
{tab === "voice" && <VoiceEditor />}
```

Add the import:

```tsx
import { VoiceEditor } from "./VoiceEditor";
```

- [ ] **Step 4: Verify in browser.**

`http://localhost:3000/dashboard/email-campaigns/sequence?tab=voice`. Expected:
- Big textarea pre-filled with the stub voice spec
- Amber warning showing the stub marker is present
- "1+ stale drafts in flight" badge

Edit the body (e.g. add a line) and save → version bumps. The chipperfield draft stays marked stale (its `voiceVersionUsed` was set to whatever the stub version was; now the current is a different version).

- [ ] **Step 5: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add voice spec editor with stub-marker warning"
```

---

## Task 11: Frontend — per-enrollment page header + actions

**Files:**
- Create: `app/dashboard/email-campaigns/enrollments/[id]/page.tsx`
- Create: `app/dashboard/email-campaigns/enrollments/[id]/EnrollmentHeader.tsx`
- Create: `app/dashboard/email-campaigns/enrollments/[id]/ActionRow.tsx`

Layout the per-enrollment page with prospect summary, status badge, the big red "Pause — they replied" button (when active), and the action row (approve/pause/stop/regenerate-all).

- [ ] **Step 1: Create the header component.**

```tsx
// app/dashboard/email-campaigns/enrollments/[id]/EnrollmentHeader.tsx
"use client";

import Link from "next/link";
import type { Doc } from "@/convex/_generated/dataModel";

const STATUS_BADGE: Record<string, string> = {
  generating: "bg-blue-100 text-blue-700",
  generation_failed: "bg-red-100 text-red-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  stopped: "bg-gray-200 text-gray-700",
  completed: "bg-teal/20 text-teal-deep",
  unsubscribed: "bg-red-100 text-red-700",
};

export function EnrollmentHeader({
  enrollment,
  lead,
  report,
}: {
  enrollment: Doc<"emailEnrollments">;
  lead: Doc<"leads"> | null;
  report: Doc<"signalReports"> | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-bold text-charcoal">
            {lead?.firstName ?? lead?.name ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-muted">{lead?.email ?? "—"}</p>
          {report && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-mono">{report.url}</span>
              <span className="ml-2 font-semibold text-charcoal">
                {report.overallScore}/100
              </span>
            </p>
          )}
          <div className="mt-3 flex gap-3 text-xs">
            {lead && (
              <Link
                href={`/dashboard/leads/${lead._id}`}
                className="text-teal hover:underline"
              >
                View lead →
              </Link>
            )}
            {report && (
              <Link
                href={`/report/${report._id}`}
                className="text-teal hover:underline"
              >
                View report →
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              STATUS_BADGE[enrollment.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {enrollment.status}
            {enrollment.pausedReason && ` (${enrollment.pausedReason})`}
          </span>
          {enrollment.generationError && (
            <p className="max-w-xs text-right text-xs text-red-700">
              {enrollment.generationError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the action row.**

```tsx
// app/dashboard/email-campaigns/enrollments/[id]/ActionRow.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export function ActionRow({
  enrollment,
}: {
  enrollment: Doc<"emailEnrollments">;
}) {
  const approve = useMutation(api.emailCampaigns.approveEnrollment);
  const pause = useMutation(api.emailCampaigns.pauseEnrollment);
  const resume = useMutation(api.emailCampaigns.resumeEnrollment);
  const stop = useMutation(api.emailCampaigns.stopEnrollment);
  const regenerate = useMutation(api.emailCampaigns.requestRegeneration);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const id = enrollment._id as Id<"emailEnrollments">;
  const replyButton = enrollment.status === "approved";

  return (
    <div className="space-y-2">
      {replyButton && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() => pause({ enrollmentId: id, reason: "replied" }))
          }
          className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Pause — they replied
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {enrollment.status === "pending_approval" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => approve({ enrollmentId: id }))}
            className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Approve
          </button>
        )}
        {enrollment.status === "approved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => pause({ enrollmentId: id, reason: "manual" }))
            }
            className="rounded-md bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-300 hover:bg-orange-200 disabled:opacity-50"
          >
            Pause manually
          </button>
        )}
        {enrollment.status === "paused" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => resume({ enrollmentId: id }))}
            className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 ring-1 ring-green-300 hover:bg-green-200 disabled:opacity-50"
          >
            Resume
          </button>
        )}
        {!["completed", "stopped", "unsubscribed", "generating"].includes(
          enrollment.status,
        ) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => stop({ enrollmentId: id }),
                "Stop this sequence permanently? Cannot be undone.",
              )
            }
            className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-100 disabled:opacity-50"
          >
            Stop
          </button>
        )}
        {!["completed", "stopped", "unsubscribed", "generating"].includes(
          enrollment.status,
        ) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => regenerate({ enrollmentId: id, fromOrder: 0 }),
                "Regenerate the entire sequence? All current drafts will be replaced.",
              )
            }
            className="rounded-md bg-warm-grey px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey/70 disabled:opacity-50"
          >
            Regenerate entire sequence
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create the page shell.**

```tsx
// app/dashboard/email-campaigns/enrollments/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EnrollmentHeader } from "./EnrollmentHeader";
import { ActionRow } from "./ActionRow";

export default function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const enrollmentId = id as Id<"emailEnrollments">;
  const data = useQuery(api.emailCampaigns.getEnrollmentWithDrafts, {
    enrollmentId,
  });

  if (data === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (data === null) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/email-campaigns"
          className="text-sm text-muted hover:text-charcoal"
        >
          ← Back to overview
        </Link>
        <p className="text-sm text-red-700">Enrollment not found.</p>
      </div>
    );
  }

  const { enrollment, drafts, lead, report } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/email-campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal"
      >
        ← Back to overview
      </Link>

      <EnrollmentHeader
        enrollment={enrollment}
        lead={lead}
        report={report}
      />

      <ActionRow enrollment={enrollment} />

      {/* Drafts timeline — built in Task 12 */}
      <p className="text-sm text-muted">
        {drafts.length} drafts. Timeline view ships in Task 12.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser.**

Click the chipperfield row from the pending approval queue. Expected:
- Header showing the prospect name + email + URL + score
- Status badge: `pending_approval`
- Action row with two buttons: "Approve" and "Regenerate entire sequence" (no "Pause — they replied" since not approved)
- "{N} drafts" line at bottom

Click "Approve" → button disappears, status badge flips to `approved`. Now "Pause — they replied" button appears (big red), plus "Pause manually", "Stop", "Regenerate entire sequence".

Click "Pause manually" → status flips to `paused (manual)`. "Resume" button appears.

Click "Resume" → back to `approved`.

- [ ] **Step 5: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add per-enrollment page with header and action row"
```

---

## Task 12: Frontend — drafts timeline (read-only)

**Files:**
- Modify: `app/dashboard/email-campaigns/enrollments/[id]/page.tsx`
- Create: `app/dashboard/email-campaigns/enrollments/[id]/DraftsTimeline.tsx`
- Create: `app/dashboard/email-campaigns/enrollments/[id]/VerificationFlags.tsx`

The timeline shows all 7 drafts as accordion rows. Each row has subject, body preview, status indicator, and badges. Editing comes in Task 13.

- [ ] **Step 1: Create the verification flags banner.**

```tsx
// app/dashboard/email-campaigns/enrollments/[id]/VerificationFlags.tsx
"use client";

import type { Doc } from "@/convex/_generated/dataModel";

export function VerificationFlags({
  flags,
}: {
  flags: Doc<"emailEnrollments">["verificationFlags"];
}) {
  if (!flags) return null;
  const total =
    flags.voice.length +
    flags.loops.length +
    flags.cheese.length +
    flags.factual.length;
  if (total === 0) return null;

  return (
    <details className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-amber-900">
        {total} verification flag{total === 1 ? "" : "s"}{" "}
        <span className="text-xs font-normal text-amber-800">
          ({flags.voice.length} voice, {flags.loops.length} loops,{" "}
          {flags.cheese.length} cheese, {flags.factual.length} factual)
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {(["voice", "loops", "cheese", "factual"] as const).map((cat) =>
          flags[cat].length > 0 ? (
            <div key={cat}>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                {cat}
              </p>
              <ul className="mt-1 space-y-1">
                {flags[cat].map((f, i) => (
                  <li key={i} className="text-amber-900">
                    <span className="font-mono text-xs">{f.role}:</span>{" "}
                    {f.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Create the drafts timeline.**

```tsx
// app/dashboard/email-campaigns/enrollments/[id]/DraftsTimeline.tsx
"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";
import { formatDate, timeAgo } from "@/lib/email-campaigns/format";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
  failed: "Failed",
  skipped_terminal: "Skipped (terminal)",
  skipped_suppressed: "Skipped (suppressed)",
};

export function DraftsTimeline({
  drafts,
}: {
  drafts: Doc<"emailDrafts">[];
}) {
  if (drafts.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        No drafts yet. The generation action may still be running.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((d) => (
        <DraftRow key={d._id} draft={d} />
      ))}
    </div>
  );
}

function DraftRow({ draft }: { draft: Doc<"emailDrafts"> }) {
  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warm-grey px-2 py-0.5 font-mono text-xs text-charcoal">
            {draft.order + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {ROLE_LABELS[draft.role as Role]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal">
            {draft.subject}
          </span>
          <DraftBadges draft={draft} />
        </div>
        <p className="mt-1 ml-12 text-xs text-muted">
          {scheduleLine(draft)}
        </p>
      </summary>
      <div className="border-t border-border bg-warm-grey/30 px-5 py-4">
        <div className="space-y-3 text-sm">
          {draft.loopsOpenedHere.length > 0 && (
            <Chips
              label="Loops opened here"
              chips={draft.loopsOpenedHere}
              tone="open"
            />
          )}
          {draft.loopsClosedHere.length > 0 && (
            <Chips
              label="Loops closed here"
              chips={draft.loopsClosedHere}
              tone="close"
            />
          )}
          {draft.reportFindingsUsed.length > 0 && (
            <Chips
              label="Report findings cited"
              chips={draft.reportFindingsUsed}
              tone="finding"
            />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Body
            </p>
            <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 font-sans text-sm text-charcoal">
              {draft.bodyText}
            </pre>
          </div>
        </div>
      </div>
    </details>
  );
}

function DraftBadges({ draft }: { draft: Doc<"emailDrafts"> }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {draft.editedByDaniel && (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
          edited
        </span>
      )}
      {draft.isStale && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          stale
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          draft.status === "sent"
            ? "bg-blue-100 text-blue-700"
            : draft.status === "scheduled"
              ? "bg-green-100 text-green-700"
              : draft.status === "draft"
                ? "bg-gray-100 text-gray-700"
                : "bg-red-100 text-red-700"
        }`}
      >
        {STATUS_LABELS[draft.status] ?? draft.status}
      </span>
    </div>
  );
}

function scheduleLine(draft: Doc<"emailDrafts">): string {
  if (draft.status === "sent") {
    return `Sent ${formatDate(draft.sentAt)}`;
  }
  if (draft.status === "scheduled") {
    return `Will send ${timeAgo(draft.scheduledFor)} — ${formatDate(draft.scheduledFor)}`;
  }
  if (draft.status === "draft") {
    return draft.order === 0
      ? "Will be scheduled when the sequence is approved."
      : "Will be scheduled after the previous email sends.";
  }
  return draft.status;
}

function Chips({
  label,
  chips,
  tone,
}: {
  label: string;
  chips: string[];
  tone: "open" | "close" | "finding";
}) {
  const cls =
    tone === "open"
      ? "bg-blue-100 text-blue-800"
      : tone === "close"
        ? "bg-green-100 text-green-800"
        : "bg-purple-100 text-purple-800";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={`rounded-full px-2 py-0.5 text-xs font-mono ${cls}`}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire timeline + verification flags into the page.**

Replace the temporary "{drafts.length} drafts" line in `enrollments/[id]/page.tsx` with:

```tsx
<VerificationFlags flags={enrollment.verificationFlags} />
<DraftsTimeline drafts={drafts} />
```

Add the imports:

```tsx
import { DraftsTimeline } from "./DraftsTimeline";
import { VerificationFlags } from "./VerificationFlags";
```

- [ ] **Step 4: Verify in browser.**

Reload the chipperfield enrollment page. Expected:
- Verification flags banner showing 7 voice flags (collapsible details)
- 7 draft accordions, each showing the role, subject, status pill, schedule line
- Click an accordion → shows loops/findings chips + the body in a code block

- [ ] **Step 5: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add drafts timeline and verification flags banner"
```

---

## Task 13: Frontend — draft inline editor + edit cascade

**Files:**
- Modify: `app/dashboard/email-campaigns/enrollments/[id]/DraftsTimeline.tsx`

Add an "Edit" button on each draft row. Editing opens an inline form. Save calls `saveDraftEdit` which marks later drafts stale. The page picks up the staleness via the live query.

- [ ] **Step 1: Refactor `DraftRow` to be editable.**

Replace the `DraftRow` function in `DraftsTimeline.tsx` with:

```tsx
function DraftRow({ draft }: { draft: Doc<"emailDrafts"> }) {
  const [editing, setEditing] = useState(false);

  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warm-grey px-2 py-0.5 font-mono text-xs text-charcoal">
            {draft.order + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {ROLE_LABELS[draft.role as Role]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal">
            {draft.subject}
          </span>
          <DraftBadges draft={draft} />
        </div>
        <p className="mt-1 ml-12 text-xs text-muted">
          {scheduleLine(draft)}
        </p>
      </summary>
      <div className="border-t border-border bg-warm-grey/30 px-5 py-4">
        {editing ? (
          <DraftEditForm
            draft={draft}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <DraftReadView draft={draft} onEdit={() => setEditing(true)} />
        )}
      </div>
    </details>
  );
}

function DraftReadView({
  draft,
  onEdit,
}: {
  draft: Doc<"emailDrafts">;
  onEdit: () => void;
}) {
  const editable = draft.status !== "sent";
  return (
    <div className="space-y-3 text-sm">
      {draft.loopsOpenedHere.length > 0 && (
        <Chips
          label="Loops opened here"
          chips={draft.loopsOpenedHere}
          tone="open"
        />
      )}
      {draft.loopsClosedHere.length > 0 && (
        <Chips
          label="Loops closed here"
          chips={draft.loopsClosedHere}
          tone="close"
        />
      )}
      {draft.reportFindingsUsed.length > 0 && (
        <Chips
          label="Report findings cited"
          chips={draft.reportFindingsUsed}
          tone="finding"
        />
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Body
        </p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 font-sans text-sm text-charcoal">
          {draft.bodyText}
        </pre>
      </div>
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey"
        >
          Edit subject + body
        </button>
      )}
    </div>
  );
}

function DraftEditForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Doc<"emailDrafts">;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const save = useMutation(api.emailCampaigns.saveDraftEdit);
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);
  const [bodyHtml, setBodyHtml] = useState(draft.bodyHtml);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode: edit text only (regen HTML from text), or edit HTML directly.
  const [showHtml, setShowHtml] = useState(false);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      // If user only edited text, regenerate HTML by wrapping paragraphs.
      const html =
        showHtml && bodyHtml !== draft.bodyHtml
          ? bodyHtml
          : textToSimpleHtml(bodyText);
      await save({
        draftId: draft._id,
        subject,
        bodyText,
        bodyHtml: html,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            Body — plain text
          </label>
          <button
            type="button"
            onClick={() => setShowHtml((v) => !v)}
            className="text-xs text-teal hover:underline"
          >
            {showHtml ? "Hide HTML" : "Edit HTML directly"}
          </button>
        </div>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={10}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-sans text-sm focus:border-teal focus:outline-none"
        />
      </div>
      {showHtml && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            Body — HTML
          </label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-xs focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            If you don&apos;t edit this, the HTML is auto-regenerated from your
            plain text on save.
          </p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save (later drafts will be marked stale)"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
```

Add the necessary imports at the top of the file:

```tsx
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
```

- [ ] **Step 2: Verify in browser.**

Open the chipperfield enrollment. Expand draft 0 (orientation). Click "Edit subject + body". Edit the subject, then click "Save". Expected:
- Form closes
- The orientation row now has both "edited" and "stale" badges? — actually only "edited"; the saveDraftEdit mutation sets `isStale: false` on the edited draft itself, and `isStale: true` on later drafts.
- Drafts 1–6 now have "stale" badges

(If the orientation already had a stale badge before from earlier voice/brief edits, the edit clears it.)

- [ ] **Step 3: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add draft inline editor with edit cascade staleness"
```

---

## Task 14: Frontend — per-draft regenerate buttons + post-edit cascade UI

**Files:**
- Modify: `app/dashboard/email-campaigns/enrollments/[id]/DraftsTimeline.tsx`

Add two regenerate buttons in the read view of each draft: "Regenerate this draft" (regenerates from this row onward) and "Regenerate later drafts" (when this draft is `editedByDaniel` and later drafts are stale).

- [ ] **Step 1: Add the regenerate buttons to `DraftReadView`.**

Replace the `DraftReadView` function with:

```tsx
function DraftReadView({
  draft,
  onEdit,
  hasStaleAfter,
}: {
  draft: Doc<"emailDrafts">;
  onEdit: () => void;
  hasStaleAfter: boolean;
}) {
  const regenerate = useMutation(api.emailCampaigns.requestRegeneration);
  const editable = draft.status !== "sent";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRegenerate(fromOrder: number, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await regenerate({
        enrollmentId: draft.enrollmentId,
        fromOrder,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {draft.loopsOpenedHere.length > 0 && (
        <Chips
          label="Loops opened here"
          chips={draft.loopsOpenedHere}
          tone="open"
        />
      )}
      {draft.loopsClosedHere.length > 0 && (
        <Chips
          label="Loops closed here"
          chips={draft.loopsClosedHere}
          tone="close"
        />
      )}
      {draft.reportFindingsUsed.length > 0 && (
        <Chips
          label="Report findings cited"
          chips={draft.reportFindingsUsed}
          tone="finding"
        />
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Body
        </p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 font-sans text-sm text-charcoal">
          {draft.bodyText}
        </pre>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey disabled:opacity-50"
          >
            Edit subject + body
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={() =>
              onRegenerate(
                draft.order,
                `Regenerate ${draft.role} (and any drafts after it)? This replaces their content with new LLM output.`,
              )
            }
            disabled={busy}
            className="rounded-md bg-warm-grey px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey/70 disabled:opacity-50"
          >
            Regenerate this draft
          </button>
        )}
        {draft.editedByDaniel && hasStaleAfter && (
          <button
            type="button"
            onClick={() =>
              onRegenerate(
                draft.order + 1,
                `Regenerate drafts ${draft.order + 2}–7 against your edited ${draft.role}?`,
              )
            }
            disabled={busy}
            className="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200 disabled:opacity-50"
          >
            Regenerate later drafts ({draft.order + 2}–{ROLES.length})
          </button>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `hasStaleAfter` from `DraftRow`.**

Update `DraftsTimeline` and `DraftRow`:

```tsx
export function DraftsTimeline({
  drafts,
}: {
  drafts: Doc<"emailDrafts">[];
}) {
  if (drafts.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        No drafts yet. The generation action may still be running.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((d) => {
        const hasStaleAfter = drafts.some(
          (other) => other.order > d.order && other.isStale,
        );
        return (
          <DraftRow key={d._id} draft={d} hasStaleAfter={hasStaleAfter} />
        );
      })}
    </div>
  );
}

function DraftRow({
  draft,
  hasStaleAfter,
}: {
  draft: Doc<"emailDrafts">;
  hasStaleAfter: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warm-grey px-2 py-0.5 font-mono text-xs text-charcoal">
            {draft.order + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {ROLE_LABELS[draft.role as Role]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal">
            {draft.subject}
          </span>
          <DraftBadges draft={draft} />
        </div>
        <p className="mt-1 ml-12 text-xs text-muted">
          {scheduleLine(draft)}
        </p>
      </summary>
      <div className="border-t border-border bg-warm-grey/30 px-5 py-4">
        {editing ? (
          <DraftEditForm
            draft={draft}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <DraftReadView
            draft={draft}
            onEdit={() => setEditing(true)}
            hasStaleAfter={hasStaleAfter}
          />
        )}
      </div>
    </details>
  );
}
```

Also add the `ROLES` import at the top of the file if not already present:

```tsx
import { ROLES, ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";
```

- [ ] **Step 3: Verify in browser.**

Open the chipperfield enrollment. Edit draft 2 (the wall) and save. Expected:
- Drafts 3–6 marked stale
- Expand draft 2 — see "edited" badge, "Regenerate later drafts (4–7)" button (amber)

Click "Regenerate later drafts (4–7)" → confirm. Expected:
- Enrollment status briefly flips to `generating` (page re-renders)
- After ~30s, status back to `pending_approval`, drafts 3–6 are fresh (no stale badges, no edited badges)
- Verifier flags re-populated

- [ ] **Step 4: Commit.**

```bash
git add app/dashboard/email-campaigns
git commit -m "feat(email-campaigns): add per-draft regenerate buttons with edit-cascade UI"
```

---

## Task 15: Frontend — lead detail page integration

**Files:**
- Modify: `app/dashboard/leads/[id]/page.tsx`

Add an "Email Campaign" section showing the prospect's enrollment (if any), with quick links and a "Suppress this email" admin action.

- [ ] **Step 1: Add a `getEnrollmentByLead` query.**

Append to `convex/emailCampaigns.ts`:

```ts
export const getEnrollmentByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const enrollments = await ctx.db
      .query("emailEnrollments")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .collect();
    if (enrollments.length === 0) return null;
    // Most recent first
    enrollments.sort((a, b) => b.enrolledAt - a.enrolledAt);
    const latest = enrollments[0];
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", latest._id),
      )
      .collect();
    const sentCount = drafts.filter((d) => d.status === "sent").length;
    return {
      enrollment: latest,
      sentCount,
      totalDrafts: drafts.length,
    };
  },
});

export const isEmailSuppressed = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const sup = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    return sup ?? null;
  },
});
```

Push + typecheck.

- [ ] **Step 2: Create the email campaign section component.**

Create `app/dashboard/leads/[id]/EmailCampaignSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/email-campaigns/format";

const STATUS_BADGE: Record<string, string> = {
  generating: "bg-blue-100 text-blue-700",
  generation_failed: "bg-red-100 text-red-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  stopped: "bg-gray-200 text-gray-700",
  completed: "bg-teal/20 text-teal-deep",
  unsubscribed: "bg-red-100 text-red-700",
};

export function EmailCampaignSection({
  leadId,
  email,
}: {
  leadId: Id<"leads">;
  email: string;
}) {
  const data = useQuery(api.emailCampaigns.getEnrollmentByLead, { leadId });
  const suppression = useQuery(api.emailCampaigns.isEmailSuppressed, { email });
  const suppress = useMutation(api.emailCampaigns.suppressEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSuppress() {
    const note = prompt(
      `Suppress ${email}? They won't receive any further sequence emails. Optional reason:`,
    );
    if (note === null) return;
    setBusy(true);
    setError(null);
    try {
      await suppress({
        email,
        note: note || undefined,
        enrollmentId: data?.enrollment._id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-charcoal">Email Campaign</h2>
      <div className="rounded-xl border border-border bg-white p-5">
        {suppression && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            <strong>Suppressed</strong> ({suppression.reason})
            {suppression.note && ` — ${suppression.note}`}
            <span className="ml-2 text-xs text-red-700">
              {formatDate(suppression.suppressedAt)}
            </span>
          </p>
        )}

        {data === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : data === null ? (
          <p className="text-sm text-muted">
            No campaign enrollment yet. One is created automatically when this
            lead generates a successful Signal Report.
          </p>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    STATUS_BADGE[data.enrollment.status] ??
                    "bg-gray-100 text-gray-600"
                  }`}
                >
                  {data.enrollment.status}
                </span>
                <span className="text-xs text-muted">
                  Sent {data.sentCount}/{data.totalDrafts} ·{" "}
                  Enrolled {formatDate(data.enrollment.enrolledAt)}
                </span>
              </div>
            </div>
            <Link
              href={`/dashboard/email-campaigns/enrollments/${data.enrollment._id}`}
              className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              Open enrollment →
            </Link>
          </div>
        )}

        {!suppression && (
          <button
            type="button"
            onClick={onSuppress}
            disabled={busy}
            className="mt-4 rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-100 disabled:opacity-50"
          >
            Suppress this email (manual)
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Slot the section into the lead detail page.**

In `app/dashboard/leads/[id]/page.tsx`, find the `{/* Signal Reports */}` section. Add the email campaign section above it (so it's visible without scrolling for active enrollments). Add the import too:

```tsx
import { EmailCampaignSection } from "./EmailCampaignSection";
```

Then insert above the Signal Reports section:

```tsx
<EmailCampaignSection leadId={lead._id} email={lead.email} />
```

- [ ] **Step 4: Verify in browser.**

Navigate to `/dashboard` (Leads). Click your chipperfield test lead (the one whose Signal Score we tested in Plan 1). Expected:
- "Email Campaign" section near the top
- Status badge (whatever current state is — should be `pending_approval` if you haven't approved, `approved` otherwise)
- "Open enrollment →" button linking to the per-enrollment page
- "Suppress this email (manual)" button

Click "Suppress this email" → prompt → enter reason → confirm. Expected:
- "Suppressed (manual)" red banner appears
- Enrollment status flips to `unsubscribed`
- Suppress button hidden

- [ ] **Step 5: Smoke-test the duplicate-trigger guard via suppression.**

If you submit the same email through a Signal Score now, the trigger should skip enrollment because the email is suppressed. Optional check — submit at `localhost:3000` with the same test email and verify in convex logs:

```
tryEnrolFromReport: <email> suppressed (manual), skipping
```

(Skip if you'd rather not generate another report.)

- [ ] **Step 6: Commit.**

```bash
git add convex/emailCampaigns.ts convex/_generated app/dashboard/leads
git commit -m "feat(email-campaigns): add lead detail page email campaign section + manual suppression"
```

---

## Task 16: End-to-end verification & branch finishing

**Files:** Read-only.

Final pass to confirm Plan 2 works end-to-end before merging.

- [ ] **Step 1: Verify the full UI tour.**

In the browser, walk:

1. `/dashboard/email-campaigns` — kill switch toggles, stats, queues. Pending queue shows the chipperfield row.
2. `/dashboard/email-campaigns/sequence` — three tabs work. Cadence saves. Briefs show seeded skeletons; saving bumps version. Voice spec textarea editable; saving bumps version.
3. `/dashboard/email-campaigns/enrollments/<id>` — header, status, action row, verification flags, drafts timeline. Edit a draft → cascade marks later drafts stale. "Regenerate later drafts" runs the action and refreshes drafts.
4. `/dashboard/leads/<id>` — Email Campaign section visible, "Open enrollment" link works, manual suppression works.

- [ ] **Step 2: Typecheck + lint final.**

```bash
npx tsc --noEmit
npm run lint --silent 2>&1 | tail -5
```

Expected: typecheck clean. Lint may show pre-existing errors (8 from master); ensure no *new* errors in files I touched (everything under `app/dashboard/email-campaigns/`, `app/dashboard/leads/[id]/EmailCampaignSection.tsx`, and the modified `convex/emailCampaigns.ts`).

- [ ] **Step 3: Reset state for Plan 3.**

Make sure:
- Kill switch is OFF (default state for Plan 3).
- The chipperfield enrollment is back to `pending_approval` (un-suppress, regenerate, or stop and start over depending on what state you left it in). If you can't easily reset, that's fine — Plan 3 doesn't depend on this specific enrollment's state.

If you suppressed the chipperfield email earlier, remove the suppression by going to the Convex data dashboard and deleting the row in `emailSuppressions` (no UI for un-suppressing yet — that's a Plan 3 nice-to-have).

- [ ] **Step 4: Push the branch and finish via the finishing-a-development-branch skill.**

```bash
git push -u origin email-campaigns-plan-2
```

Then run the finishing skill, which will:
1. Verify lint shows no new issues
2. Detect normal repo
3. Present the 4-option menu (merge / PR / keep / discard)

Daniel picks merge or PR. Plan 2 is then closed and Plan 3 can begin.

Plan 2 done. The system now:
- Surfaces every enrollment in a dashboard with stats, kill switch, queues
- Lets Daniel edit voice spec and per-role briefs with versioning + stale flagging
- Lets Daniel approve, pause, resume, stop, regenerate sequences end-to-end in the UI
- Lets Daniel edit drafts with cascade staleness, then regenerate from any role
- Lets Daniel suppress an email manually from the lead detail page

Plan 3 (sending, scheduling, webhooks, unsubscribe) is the last piece.
