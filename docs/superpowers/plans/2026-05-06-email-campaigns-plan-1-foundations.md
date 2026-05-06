# Email Campaigns — Plan 1: Foundations & Generation Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Signal Report completes successfully, automatically generate a 7-email soap-opera sequence using LLM personalisation against a voice spec and per-role briefs. Drafts land in `emailEnrollments` / `emailDrafts` tables ready for human review (UI built in Plan 2). Nothing sends yet (sending built in Plan 3).

**Architecture:** Convex internal actions orchestrate the LLM pipeline. The trigger hooks into the existing `runReportGeneration` action after a successful report. Each draft is generated sequentially (each draft needs the prior drafts in its prompt), then a verifier pass runs over all 7. Voice spec and briefs are versioned database documents, edited via mutations.

**Tech Stack:** Convex (backend, schema, actions), OpenRouter API (Gemini 2.5 Flash primary, Qwen 3.6 Plus fallback), Next.js (existing app shell), TypeScript.

**Verification model:** This codebase has no automated test suite. Each task ends with a manual verification step — typecheck (`npx tsc --noEmit`), Convex CLI invocations (`npx convex run <fn> '{json}'`), and Convex dashboard inspection. Where smoke verification needs a real LLM call, dev-environment verification is acceptable; do not commit before observing the success path at least once.

**Reference spec:** `docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md`. When this plan is ambiguous, the spec is the source of truth.

**Out of scope for this plan (covered in Plans 2 and 3):**
- Admin dashboard UI (`/dashboard/email-campaigns/*` pages)
- Approval action, edit-cascade UI, regeneration buttons
- The `sendDraft` action, scheduler chain, business-hours clamp
- Resend webhook handler
- `/unsubscribe` page
- Manual pause / stop UI controls

This plan ends with a system that *generates* a sequence end-to-end. Plan 2 makes it human-reviewable. Plan 3 makes it actually send.

---

## Pre-flight

- [ ] **Working tree clean.** Run `git status` and confirm no uncommitted changes before starting. If anything's uncommitted, commit or stash it first.
- [ ] **Convex dev running.** In one terminal, run `npx convex dev` and leave it running for the duration of this plan. Schema and function changes hot-reload.
- [ ] **Environment.** Confirm `OPENROUTER_API_KEY` is set in the Convex deployment env (`npx convex env list` should show it). It already exists for the insights pipeline, so this should be a no-op check.

---

## Task 1: Extend the Convex schema

**Files:**
- Modify: `convex/schema.ts`

The existing scaffolded `emailSequences`, `emailEnrollments`, `emailSends` tables get extended. The scaffolded `emailSequenceSteps` is removed (it was per-template, but we need per-recipient drafts). New tables added: `campaignConfig`, `emailVoiceSpec`, `emailRoleBriefs`, `emailDrafts`, `emailSuppressions`.

- [ ] **Step 1: Read the current schema file** so you know what's there.

Run: `cat convex/schema.ts | head -360`
Expected: see the existing tables including the four scaffolded `emailSequences`, `emailSequenceSteps`, `emailEnrollments`, `emailSends`.

- [ ] **Step 2: Replace the email-related scaffolded tables with the new schema.**

In `convex/schema.ts`, locate the section after `// ── FUTURE TABLES (defined now, populated later) ──` containing `emailSequences`, `emailSequenceSteps`, `emailEnrollments`, `emailSends`. Replace those four definitions (and remove `emailSequenceSteps` entirely) with this block. Leave `tags` and `leadTags` as-is — they're unrelated.

```ts
  // ── EMAIL CAMPAIGNS ──

  campaignConfig: defineTable({
    globalKillSwitch: v.boolean(),
    killSwitchNote: v.optional(v.string()),
    killSwitchUpdatedAt: v.number(),
    fromAddress: v.string(),
    defaultLlmModel: v.string(),
    businessHoursEnabled: v.boolean(),
    businessHoursStartUtcMinutes: v.number(),
    businessHoursEndUtcMinutes: v.number(),
    businessDays: v.array(v.number()),
    unsubscribeBaseUrl: v.string(),
  }),

  emailVoiceSpec: defineTable({
    body: v.string(),
    version: v.number(),
    isCurrent: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_isCurrent", ["isCurrent"])
    .index("by_version", ["version"]),

  emailSequences: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    trigger: v.string(),
    isActive: v.boolean(),
    roleGaps: v.array(v.number()),
    orientationRespectsBusinessHours: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_trigger", ["trigger"]),

  emailRoleBriefs: defineTable({
    sequenceId: v.id("emailSequences"),
    role: v.union(
      v.literal("orientation"),
      v.literal("backstory"),
      v.literal("wall"),
      v.literal("epiphany"),
      v.literal("application"),
      v.literal("hidden_benefits"),
      v.literal("offer"),
    ),
    order: v.number(),
    purpose: v.string(),
    requiredBeats: v.string(),
    loopsToOpen: v.string(),
    loopsToClose: v.string(),
    tone: v.string(),
    lengthGuide: v.string(),
    workedExample: v.string(),
    version: v.number(),
    isCurrent: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_sequence_role_isCurrent", ["sequenceId", "role", "isCurrent"])
    .index("by_sequence_role_version", ["sequenceId", "role", "version"]),

  emailEnrollments: defineTable({
    leadId: v.id("leads"),
    sequenceId: v.id("emailSequences"),
    reportId: v.id("signalReports"),
    status: v.union(
      v.literal("generating"),
      v.literal("generation_failed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("completed"),
      v.literal("unsubscribed"),
    ),
    pausedReason: v.optional(
      v.union(
        v.literal("replied"),
        v.literal("manual"),
        v.literal("stale_cascade"),
      ),
    ),
    voiceVersionUsed: v.number(),
    loopLedger: v.array(
      v.object({
        id: v.string(),
        openedInRole: v.string(),
        closedInRole: v.optional(v.string()),
        description: v.string(),
      }),
    ),
    verificationFlags: v.optional(
      v.object({
        voice: v.array(
          v.object({ role: v.string(), note: v.string() }),
        ),
        loops: v.array(
          v.object({ role: v.string(), note: v.string() }),
        ),
        cheese: v.array(
          v.object({ role: v.string(), note: v.string() }),
        ),
        factual: v.array(
          v.object({ role: v.string(), note: v.string() }),
        ),
      }),
    ),
    generationError: v.optional(v.string()),
    enrolledAt: v.number(),
    approvedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    stoppedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_leadId", ["leadId"])
    .index("by_sequenceId", ["sequenceId"])
    .index("by_status", ["status"])
    .index("by_reportId", ["reportId"]),

  emailDrafts: defineTable({
    enrollmentId: v.id("emailEnrollments"),
    role: v.union(
      v.literal("orientation"),
      v.literal("backstory"),
      v.literal("wall"),
      v.literal("epiphany"),
      v.literal("application"),
      v.literal("hidden_benefits"),
      v.literal("offer"),
    ),
    order: v.number(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    scheduledFor: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped_terminal"),
      v.literal("skipped_suppressed"),
    ),
    briefVersionUsed: v.number(),
    voiceVersionUsed: v.number(),
    loopsOpenedHere: v.array(v.string()),
    loopsClosedHere: v.array(v.string()),
    reportFindingsUsed: v.array(v.string()),
    isStale: v.boolean(),
    editedByDaniel: v.boolean(),
    unsubscribeToken: v.string(),
  })
    .index("by_enrollment", ["enrollmentId"])
    .index("by_status", ["status"])
    .index("by_unsubscribeToken", ["unsubscribeToken"]),

  emailSends: defineTable({
    enrollmentId: v.id("emailEnrollments"),
    draftId: v.id("emailDrafts"),
    leadId: v.id("leads"),
    subject: v.string(),
    resendId: v.optional(v.string()),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("failed"),
    ),
    openedAt: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    clickedUrl: v.optional(v.string()),
    bouncedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
    sentAt: v.number(),
  })
    .index("by_leadId", ["leadId"])
    .index("by_enrollmentId", ["enrollmentId"])
    .index("by_draftId", ["draftId"])
    .index("by_resendId", ["resendId"]),

  emailSuppressions: defineTable({
    email: v.string(),
    reason: v.union(
      v.literal("unsubscribed"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("manual"),
    ),
    suppressedAt: v.number(),
    enrollmentId: v.optional(v.id("emailEnrollments")),
    note: v.optional(v.string()),
  }).index("by_email", ["email"]),
```

- [ ] **Step 3: Verify the Convex dev server reloads cleanly.**

Watch the `npx convex dev` terminal. Expected: schema diff prints, then `Convex functions ready! (Xs)`. No errors. If you see `Schema validation failed`, fix the offending typed field; the schema must match what's in the file before any data is written.

- [ ] **Step 4: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors. (Some unused-variable warnings in unrelated files are OK.)

- [ ] **Step 5: Commit.**

```bash
git add convex/schema.ts
git commit -m "feat(email-campaigns): extend schema with voice/briefs/drafts/suppressions tables"
```

---

## Task 2: Role constants & shared types

**Files:**
- Create: `lib/email-campaigns/roles.ts`

Centralised role list, default cadence, and the voice-spec-stub marker. This module has no dependencies and is imported by every other module in the feature.

- [ ] **Step 1: Create the directory.**

Run: `mkdir -p lib/email-campaigns`
Expected: directory exists. (On Windows in PowerShell, use `New-Item -ItemType Directory -Force lib/email-campaigns`.)

- [ ] **Step 2: Write the file.**

```ts
// lib/email-campaigns/roles.ts

export const ROLES = [
  "orientation",
  "backstory",
  "wall",
  "epiphany",
  "application",
  "hidden_benefits",
  "offer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  orientation: "Orientation",
  backstory: "Backstory & stakes",
  wall: "The wall",
  epiphany: "The epiphany",
  application: "Application & proof",
  hidden_benefits: "Hidden benefits",
  offer: "The offer",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gap to wait BEFORE sending each role, measured from the previous role's send.
 * Index matches ROLES. Index 0 (orientation) is 0 because the orientation
 * email's send time is computed from the trigger time, not from a previous send.
 */
export const DEFAULT_ROLE_GAPS_MS: number[] = [
  0,
  1 * DAY_MS,
  1 * DAY_MS,
  2 * DAY_MS,
  2 * DAY_MS,
  3 * DAY_MS,
  3 * DAY_MS,
];

/** Sentinel string that, if present in the voice spec, makes the verifier flag every draft. */
export const VOICE_SPEC_STUB_MARKER = "<<VOICE SPEC STUB>>";

/** The text inserted into the voice spec when seeding. */
export const VOICE_SPEC_STUB_BODY = `${VOICE_SPEC_STUB_MARKER}

Voice spec — fill me in. The system flags every draft as voice-failed while this stub is in place. See the design spec at docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md for what to write.`;
```

- [ ] **Step 3: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit.**

```bash
git add lib/email-campaigns/roles.ts
git commit -m "feat(email-campaigns): add role constants and default cadence"
```

---

## Task 3: Seed mutation

**Files:**
- Create: `convex/emailCampaigns.ts`

A single internal mutation `seed` that, when invoked once, inserts: `campaignConfig` (kill switch ON), one `emailSequences` row, seven skeleton `emailRoleBriefs` rows, one stub `emailVoiceSpec` row. Idempotent — re-running noops if `campaignConfig` already exists.

- [ ] **Step 1: Create the file with the seed mutation.**

```ts
// convex/emailCampaigns.ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  ROLES,
  DEFAULT_ROLE_GAPS_MS,
  VOICE_SPEC_STUB_BODY,
  ROLE_LABELS,
} from "../lib/email-campaigns/roles";

const SKELETON_BRIEFS: Record<string, {
  purpose: string;
  requiredBeats: string;
  loopsToOpen: string;
  loopsToClose: string;
  tone: string;
  lengthGuide: string;
  workedExample: string;
}> = {
  orientation: {
    purpose:
      "Introduce Daniel, set up what's coming, and surface the one most striking finding from the report. Make the reader want the next email.",
    requiredBeats:
      "Greet them by first name. Reference the URL audited. Surface ONE concrete finding from the report (not the worst score — the most interesting one). Tease one specific weird detail about Daniel's story or the upcoming sequence as an open loop. Promise the next email.",
    loopsToOpen:
      "One narrative loop pointing at the backstory email — a specific, weird, concrete detail from Daniel's story (e.g. 'why I closed my laptop and walked out for two hours').",
    loopsToClose: "None — first email.",
    tone:
      "Warm but not over-friendly. Direct. Reads like Daniel sat down after looking at their site and wrote them.",
    lengthGuide: "120-180 words.",
    workedExample:
      "[FILL IN — write a complete orientation email in Daniel's voice for a fictional plumber who scored 6/10. Use it as a stylistic anchor for the LLM.]",
  },
  backstory: {
    purpose:
      "Establish where Daniel was before — humanise him, make the reader care. Open the loop that closes in the wall email.",
    requiredBeats:
      "Brief Royal Marine context (background, not theme). What Daniel was doing before web strategy. What was at risk for him personally.",
    loopsToOpen: "Tease the moment things had to change ('the wall').",
    loopsToClose:
      "Close the orientation loop's specific detail (deliver the consultant line, the laptop moment, etc.).",
    tone: "Reflective, not dramatic. Specific not vague.",
    lengthGuide: "150-220 words.",
    workedExample: "[FILL IN]",
  },
  wall: {
    purpose:
      "The crisis point. The moment Daniel realised the old approach wasn't working.",
    requiredBeats:
      "A specific incident or realisation. What broke. What he saw that he hadn't before. Should mirror the recipient's likely weakness from the report — if their CTA is weak, the wall is when Daniel realised CTAs were the issue. If their messaging is weak, the wall is messaging.",
    loopsToOpen: "Tease the new lens (epiphany).",
    loopsToClose: "Close the loop opened in the backstory email.",
    tone: "Honest. No transformation porn.",
    lengthGuide: "150-220 words.",
    workedExample: "[FILL IN]",
  },
  epiphany: {
    purpose:
      "The shift in thinking. The new lens. Name the principle the recipient is violating and reframe it.",
    requiredBeats:
      "The principle (generic). The recipient's specific violation (from the report). Why the old way fails and the new way works.",
    loopsToOpen: "Tease how the new way actually works in practice (application email).",
    loopsToClose: "Close the loop opened in the wall email.",
    tone: "Confident but not preachy.",
    lengthGuide: "180-250 words.",
    workedExample: "[FILL IN]",
  },
  application: {
    purpose:
      "Show how the new way actually works, with proof. Apply it to the recipient's site.",
    requiredBeats:
      "Concrete mechanism. Evidence (case, before/after, principle in action). Rewrite one section of the recipient's actual copy, OR describe what their hero would look like fixed.",
    loopsToOpen:
      "Tease a second-order benefit the reader hasn't thought of (hidden benefits email).",
    loopsToClose: "Close the loop opened in the epiphany email.",
    tone: "Practical. Working-out-loud.",
    lengthGuide: "200-280 words.",
    workedExample: "[FILL IN]",
  },
  hidden_benefits: {
    purpose:
      "Surface second-order benefits — each quietly answers a likely objection.",
    requiredBeats:
      "Two or three benefits the reader hadn't considered. Tied to their industry context (plumber's hidden benefits look different from a hearing clinic's). Each benefit pre-empts a different objection.",
    loopsToOpen: "Tease the offer — what comes next, why now.",
    loopsToClose: "Close the loop opened in the application email.",
    tone: "Generous. Like sharing what you've noticed.",
    lengthGuide: "180-250 words.",
    workedExample: "[FILL IN]",
  },
  offer: {
    purpose:
      "Make the ask. Name the gap between where they are (per their report) and where the offer takes them.",
    requiredBeats:
      "Reference the specific gap from their report. The offer (subscription tier most appropriate to their score and business). Why now. Clear CTA — reply to the email.",
    loopsToOpen: "None — last email.",
    loopsToClose: "Close every remaining open loop.",
    tone: "Direct. No reluctance theatre.",
    lengthGuide: "180-250 words.",
    workedExample: "[FILL IN]",
  },
};

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingConfig = await ctx.db.query("campaignConfig").first();
    if (existingConfig) {
      console.log("emailCampaigns:seed — already seeded, noop");
      return { seeded: false };
    }

    const now = Date.now();
    const adminEmail = "daniel@dreamfree.co.uk";

    await ctx.db.insert("campaignConfig", {
      globalKillSwitch: true,
      killSwitchUpdatedAt: now,
      fromAddress: "Daniel at Dreamfree <daniel@dreamfree.co.uk>",
      defaultLlmModel: "google/gemini-2.5-flash",
      businessHoursEnabled: true,
      businessHoursStartUtcMinutes: 9 * 60,
      businessHoursEndUtcMinutes: 18 * 60,
      businessDays: [1, 2, 3, 4, 5],
      unsubscribeBaseUrl: "https://dreamfree.co.uk/unsubscribe",
    });

    const sequenceId = await ctx.db.insert("emailSequences", {
      name: "Signal Report Soap Opera",
      description:
        "Triggered when a Signal Report completes. 7 emails, LLM-personalised against the recipient's report findings.",
      trigger: "signal_report_success",
      isActive: true,
      roleGaps: DEFAULT_ROLE_GAPS_MS,
      orientationRespectsBusinessHours: false,
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i];
      const skeleton = SKELETON_BRIEFS[role];
      await ctx.db.insert("emailRoleBriefs", {
        sequenceId,
        role,
        order: i,
        purpose: skeleton.purpose,
        requiredBeats: skeleton.requiredBeats,
        loopsToOpen: skeleton.loopsToOpen,
        loopsToClose: skeleton.loopsToClose,
        tone: skeleton.tone,
        lengthGuide: skeleton.lengthGuide,
        workedExample: skeleton.workedExample,
        version: 1,
        isCurrent: true,
        createdAt: now,
        createdBy: adminEmail,
      });
    }

    await ctx.db.insert("emailVoiceSpec", {
      body: VOICE_SPEC_STUB_BODY,
      version: 1,
      isCurrent: true,
      createdAt: now,
      createdBy: adminEmail,
    });

    console.log(
      `emailCampaigns:seed — inserted config + sequence ${sequenceId} + ${ROLES.length} briefs + voice stub`,
    );
    return { seeded: true, sequenceId };
  },
});
```

- [ ] **Step 2: Watch the Convex dev server reload.**

Expected: `Convex functions ready!` with no errors.

- [ ] **Step 3: Run the seed.**

Run: `npx convex run --component=null emailCampaigns:seed '{}'`

If your project doesn't use components, the simpler form works:
Run: `npx convex run emailCampaigns:seed '{}'`

Expected output (something like):
```
{ seeded: true, sequenceId: 'xxxxxxxxxxxxx' }
```

- [ ] **Step 4: Verify rows in the Convex dashboard.**

Open the Convex dashboard for this project. Confirm:
- `campaignConfig`: 1 row, `globalKillSwitch: true`
- `emailSequences`: 1 row, name "Signal Report Soap Opera"
- `emailRoleBriefs`: 7 rows, one per role, all `isCurrent: true`, `version: 1`
- `emailVoiceSpec`: 1 row, body starts with `<<VOICE SPEC STUB>>`, `isCurrent: true`

- [ ] **Step 5: Run seed a second time and verify it noops.**

Run: `npx convex run emailCampaigns:seed '{}'`
Expected: `{ seeded: false }`. No new rows in any table. Confirm in dashboard.

- [ ] **Step 6: Commit.**

```bash
git add convex/emailCampaigns.ts
git commit -m "feat(email-campaigns): add seed mutation for config, sequence, briefs, voice stub"
```

---

## Task 4: Voice spec mutations and queries

**Files:**
- Modify: `convex/emailCampaigns.ts`

Add `getCurrentVoiceSpec` (query), `listVoiceSpecVersions` (query), `saveVoiceSpec` (mutation). The save creates a new versioned row, flips the previous current row off, and marks all pending/approved enrollments' drafts stale.

- [ ] **Step 1: Add the imports and queries to the top of `convex/emailCampaigns.ts` (after the existing imports).**

Add these imports if not already present:
```ts
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
```

Then append below the existing `seed` mutation:

```ts
export const getCurrentVoiceSpec = query({
  args: {},
  handler: async (ctx) => {
    const current = await ctx.db
      .query("emailVoiceSpec")
      .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
      .first();
    return current;
  },
});

export const listVoiceSpecVersions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("emailVoiceSpec")
      .withIndex("by_version")
      .order("desc")
      .collect();
  },
});

export const saveVoiceSpec = mutation({
  args: {
    body: v.string(),
    editorEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("emailVoiceSpec")
      .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
      .first();

    if (previous) {
      await ctx.db.patch(previous._id, { isCurrent: false });
    }

    const newVersion = (previous?.version ?? 0) + 1;

    const newId = await ctx.db.insert("emailVoiceSpec", {
      body: args.body,
      version: newVersion,
      isCurrent: true,
      createdAt: Date.now(),
      createdBy: args.editorEmail,
    });

    // Mark drafts in pending_approval/approved enrollments as stale.
    const allEnrollments = await ctx.db.query("emailEnrollments").collect();
    const targets = allEnrollments.filter(
      (e) =>
        e.status === "pending_approval" || e.status === "approved",
    );
    for (const enrollment of targets) {
      const drafts = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", enrollment._id),
        )
        .collect();
      for (const draft of drafts) {
        if (draft.status === "sent") continue;
        if (draft.voiceVersionUsed < newVersion && !draft.isStale) {
          await ctx.db.patch(draft._id, { isStale: true });
        }
      }
    }

    return { newId, version: newVersion };
  },
});
```

- [ ] **Step 2: Verify Convex reloads cleanly.**

Watch the dev server. Expected: no errors. If TypeScript complains about the `any` cast on `ctx`, that's intentional — the helper has to accept the union of mutation/internalMutation contexts. Lint warnings about `any` are acceptable here.

- [ ] **Step 3: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke test — read current voice spec.**

Run: `npx convex run emailCampaigns:getCurrentVoiceSpec '{}'`
Expected: returns the seeded stub with `version: 1`, `isCurrent: true`, body starting with `<<VOICE SPEC STUB>>`.

- [ ] **Step 5: Smoke test — save a new voice spec.**

Run: `npx convex run emailCampaigns:saveVoiceSpec '{"body":"Test voice spec v2","editorEmail":"daniel@dreamfree.co.uk"}'`
Expected: returns `{ newId: ..., version: 2 }`.

- [ ] **Step 6: Verify previous version is no longer current.**

Run: `npx convex run emailCampaigns:listVoiceSpecVersions '{}'`
Expected: array of 2 rows. Latest has `version: 2, isCurrent: true`. Earlier has `version: 1, isCurrent: false`.

- [ ] **Step 7: Commit.**

```bash
git add convex/emailCampaigns.ts
git commit -m "feat(email-campaigns): add voice spec queries and versioned save mutation"
```

---

## Task 5: Brief mutations and queries

**Files:**
- Modify: `convex/emailCampaigns.ts`

Add `getCurrentBriefs` (query — returns all 7 current briefs for a sequence), `getCurrentBrief` (query — single by sequence + role), `listBriefVersions` (query), `saveBrief` (mutation — versioned, marks affected drafts stale).

- [ ] **Step 1: Add the role validator and the brief functions.**

Append to `convex/emailCampaigns.ts`:

```ts
const roleValidator = v.union(
  v.literal("orientation"),
  v.literal("backstory"),
  v.literal("wall"),
  v.literal("epiphany"),
  v.literal("application"),
  v.literal("hidden_benefits"),
  v.literal("offer"),
);

export const getCurrentBriefs = query({
  args: { sequenceId: v.id("emailSequences") },
  handler: async (ctx, args) => {
    const briefs: Doc<"emailRoleBriefs">[] = [];
    for (const role of ROLES) {
      const brief = await ctx.db
        .query("emailRoleBriefs")
        .withIndex("by_sequence_role_isCurrent", (q) =>
          q
            .eq("sequenceId", args.sequenceId)
            .eq("role", role)
            .eq("isCurrent", true),
        )
        .first();
      if (brief) briefs.push(brief);
    }
    briefs.sort((a, b) => a.order - b.order);
    return briefs;
  },
});

export const getCurrentBrief = query({
  args: {
    sequenceId: v.id("emailSequences"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailRoleBriefs")
      .withIndex("by_sequence_role_isCurrent", (q) =>
        q
          .eq("sequenceId", args.sequenceId)
          .eq("role", args.role)
          .eq("isCurrent", true),
      )
      .first();
  },
});

export const listBriefVersions = query({
  args: {
    sequenceId: v.id("emailSequences"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailRoleBriefs")
      .withIndex("by_sequence_role_version", (q) =>
        q.eq("sequenceId", args.sequenceId).eq("role", args.role),
      )
      .order("desc")
      .collect();
  },
});

export const saveBrief = mutation({
  args: {
    sequenceId: v.id("emailSequences"),
    role: roleValidator,
    purpose: v.string(),
    requiredBeats: v.string(),
    loopsToOpen: v.string(),
    loopsToClose: v.string(),
    tone: v.string(),
    lengthGuide: v.string(),
    workedExample: v.string(),
    editorEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("emailRoleBriefs")
      .withIndex("by_sequence_role_isCurrent", (q) =>
        q
          .eq("sequenceId", args.sequenceId)
          .eq("role", args.role)
          .eq("isCurrent", true),
      )
      .first();

    if (!previous) {
      throw new Error(
        `No existing brief for sequence=${args.sequenceId} role=${args.role}. Run seed first.`,
      );
    }

    await ctx.db.patch(previous._id, { isCurrent: false });

    const newVersion = previous.version + 1;
    const newId = await ctx.db.insert("emailRoleBriefs", {
      sequenceId: args.sequenceId,
      role: args.role,
      order: previous.order,
      purpose: args.purpose,
      requiredBeats: args.requiredBeats,
      loopsToOpen: args.loopsToOpen,
      loopsToClose: args.loopsToClose,
      tone: args.tone,
      lengthGuide: args.lengthGuide,
      workedExample: args.workedExample,
      version: newVersion,
      isCurrent: true,
      createdAt: Date.now(),
      createdBy: args.editorEmail,
    });

    // Mark drafts in pending_approval/approved enrollments as stale (this role only).
    const allEnrollments = await ctx.db.query("emailEnrollments").collect();
    const targets = allEnrollments.filter(
      (e) =>
        e.sequenceId === args.sequenceId &&
        (e.status === "pending_approval" || e.status === "approved"),
    );
    for (const enrollment of targets) {
      const drafts = await ctx.db
        .query("emailDrafts")
        .withIndex("by_enrollment", (q) =>
          q.eq("enrollmentId", enrollment._id),
        )
        .collect();
      for (const draft of drafts) {
        if (draft.role !== args.role) continue;
        if (draft.status === "sent") continue;
        if (draft.briefVersionUsed < newVersion && !draft.isStale) {
          await ctx.db.patch(draft._id, { isStale: true });
        }
      }
    }

    return { newId, version: newVersion };
  },
});
```

- [ ] **Step 2: Verify Convex reloads + typecheck.**

Watch dev server: clean reload.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test — read current briefs.**

Run: `npx convex run emailCampaigns:getCurrentBriefs '{"sequenceId":"<paste sequenceId from seed>"}'`

To get the sequenceId, query the dashboard or run:
`npx convex data emailSequences` and copy the `_id`.

Expected: array of 7 briefs in role order (orientation first, offer last). Each `version: 1`, `isCurrent: true`.

- [ ] **Step 4: Smoke test — save a new brief version.**

```bash
npx convex run emailCampaigns:saveBrief '{
  "sequenceId":"<sequenceId>",
  "role":"orientation",
  "purpose":"Updated purpose",
  "requiredBeats":"Same beats",
  "loopsToOpen":"Loop A",
  "loopsToClose":"none",
  "tone":"Friendly",
  "lengthGuide":"120 words",
  "workedExample":"Hi {firstName}...",
  "editorEmail":"daniel@dreamfree.co.uk"
}'
```

Expected: returns `{ newId, version: 2 }`. Verify in dashboard: orientation now has 2 rows (v1 isCurrent:false, v2 isCurrent:true).

- [ ] **Step 5: Commit.**

```bash
git add convex/emailCampaigns.ts
git commit -m "feat(email-campaigns): add brief queries and versioned save mutation"
```

---

## Task 6: HMAC unsubscribe token utility

**Files:**
- Create: `lib/email-campaigns/unsubscribe-token.ts`

Sign and verify tokens for `/unsubscribe?t=...`. Uses `jose` (already a dependency). Token payload: `{ enrollmentId, draftId }`. Used by Plan 3 — built now because every draft needs one when it's generated.

- [ ] **Step 1: Write the file.**

```ts
// lib/email-campaigns/unsubscribe-token.ts
import { SignJWT, jwtVerify } from "jose";

export interface UnsubscribeTokenPayload {
  enrollmentId: string;
  draftId: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "UNSUBSCRIBE_SIGNING_SECRET env var is missing or shorter than 32 chars",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signUnsubscribeToken(
  payload: UnsubscribeTokenPayload,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("dreamfree-email-campaigns")
    .sign(getSecret());
}

export async function verifyUnsubscribeToken(
  token: string,
): Promise<UnsubscribeTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: "dreamfree-email-campaigns",
    });
    if (
      typeof payload.enrollmentId === "string" &&
      typeof payload.draftId === "string"
    ) {
      return {
        enrollmentId: payload.enrollmentId,
        draftId: payload.draftId,
      };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add the env var to Convex deployment.**

Run a single secure-random command first to generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character hex string. Then run:
```bash
npx convex env set UNSUBSCRIBE_SIGNING_SECRET <paste-the-secret>
```

Expected output: `Updated environment variable UNSUBSCRIBE_SIGNING_SECRET`. Confirm with `npx convex env list`.

- [ ] **Step 3: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke test the round-trip via a temporary script.**

Create `scripts/__test-unsubscribe-token.ts` (delete after):

```ts
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../lib/email-campaigns/unsubscribe-token";

async function main() {
  const token = await signUnsubscribeToken({
    enrollmentId: "fake_enrollment_id",
    draftId: "fake_draft_id",
  });
  console.log("Token:", token);
  const decoded = await verifyUnsubscribeToken(token);
  console.log("Decoded:", decoded);
  if (
    decoded?.enrollmentId !== "fake_enrollment_id" ||
    decoded.draftId !== "fake_draft_id"
  ) {
    console.error("Round-trip mismatch");
    process.exit(1);
  }
  const tampered = await verifyUnsubscribeToken(token + "x");
  console.log("Tampered (should be null):", tampered);
  if (tampered !== null) {
    console.error("Tampered token verified — bug");
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Set the secret locally first:
```bash
$env:UNSUBSCRIBE_SIGNING_SECRET = "<paste-the-same-secret>"
```
(or `export` if using bash)

Run: `npx tsx scripts/__test-unsubscribe-token.ts`
Expected output:
```
Token: eyJ...
Decoded: { enrollmentId: 'fake_enrollment_id', draftId: 'fake_draft_id' }
Tampered (should be null): null
OK
```

- [ ] **Step 5: Delete the temp script.**

Run: `rm scripts/__test-unsubscribe-token.ts` (or `Remove-Item` in PowerShell).

- [ ] **Step 6: Commit.**

```bash
git add lib/email-campaigns/unsubscribe-token.ts
git commit -m "feat(email-campaigns): add HMAC unsubscribe token signing/verification"
```

---

## Task 7: OpenRouter client wrapper

**Files:**
- Create: `lib/email-campaigns/openrouter.ts`

Shared OpenRouter client for the campaign feature. Pattern lifted from `convex/signalReportsAction.ts` and `convex/signalInsightsAction.ts`. Returns the raw response string (caller parses); takes a temperature param so different prompts (generation vs verifier) can use different settings.

- [ ] **Step 1: Write the file.**

```ts
// lib/email-campaigns/openrouter.ts

const PER_CALL_TIMEOUT_MS = 90_000;

export interface OpenRouterCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  /** Set to "json_object" to force JSON output. Default undefined = free-form. */
  responseFormat?: "json_object";
  /** Optional title for OpenRouter's dashboard tagging. */
  title?: string;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/**
 * Calls OpenRouter and returns the raw assistant message content.
 * Throws OpenRouterError on HTTP/upstream failures, empty responses, or timeouts.
 */
export async function callOpenRouter(
  opts: OpenRouterCallOptions,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY env var is not set");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dreamfree.co.uk",
      "X-OpenRouter-Title": opts.title ?? "Dreamfree Email Campaigns",
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const data = await res.json();
  if (data.error) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error.message || JSON.stringify(data.error);
    throw new OpenRouterError(`OpenRouter error: ${message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new OpenRouterError(
      `Empty response (finish_reason=${data.choices?.[0]?.finish_reason ?? "unknown"})`,
    );
  }

  return content;
}

/**
 * Strips markdown fences and trims whitespace, then parses JSON. Uses jsonrepair
 * if a strict parse fails — matches the pattern in lib/insights-prompt.
 */
export function parseLlmJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // jsonrepair is already a project dep — fix common LLM JSON drift
    // (trailing commas, unescaped quotes inside strings, etc.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { jsonrepair } = require("jsonrepair");
    return JSON.parse(jsonrepair(cleaned)) as T;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/email-campaigns/openrouter.ts
git commit -m "feat(email-campaigns): add shared OpenRouter client wrapper with JSON parsing"
```

---

## Task 8: Generation prompt builder

**Files:**
- Create: `lib/email-campaigns/generation-prompt.ts`

Pure functions that build the system + user prompts for one draft. No I/O. Easy to read because the prompt is the contract — keep it inspectable.

- [ ] **Step 1: Write the file.**

```ts
// lib/email-campaigns/generation-prompt.ts
import type { Role } from "./roles";
import { ROLES, ROLE_LABELS } from "./roles";

export interface PriorDraft {
  role: Role;
  subject: string;
  bodyText: string;
}

export interface LoopLedgerEntry {
  id: string;
  openedInRole: string;
  closedInRole?: string;
  description: string;
}

export interface BriefForPrompt {
  purpose: string;
  requiredBeats: string;
  loopsToOpen: string;
  loopsToClose: string;
  tone: string;
  lengthGuide: string;
  workedExample: string;
}

export interface ReportForPrompt {
  url: string;
  customerDescription: string;
  overallScore: number;
  gruntTest: { pass: boolean; explanation: string };
  elements: Record<
    string,
    {
      score: number;
      summary: string;
      analysis: string;
      businessImpact: string;
      recommendations: string[];
    }
  >;
  quickWin: string;
  strengths: string[];
  fullSummary: string;
}

export interface GenerationPromptArgs {
  voiceSpec: string;
  recipientFirstName: string;
  recipientEmail: string;
  report: ReportForPrompt;
  role: Role;
  brief: BriefForPrompt;
  priorDrafts: PriorDraft[];
  loopLedger: LoopLedgerEntry[];
}

const SYSTEM_HOUSE_RULES = `You write JSON only. Output exactly this shape:
{
  "subject": string,
  "bodyHtml": string,         // simple HTML, paragraphs as <p>, no inline styles
  "bodyText": string,         // plain-text equivalent, line breaks preserved
  "loopsOpened": [{ "id": string, "description": string }],
  "loopsClosed": [string],    // ids of previously open loops you closed in this email
  "reportFindingsUsed": [string]  // short labels: "grunt-test pass", "weak CTA copy", etc.
}

House rules — non-negotiable:
- No manufactured drama, vague specifics, guru voice, transformation porn, or fake reluctance.
- Personalisation must do argumentative work, not decorative work. If you can remove a report-derived line and the argument doesn't weaken, leave it out.
- Read it aloud. Would Daniel say it that way to a friend at the pub? If not, cut it.
- bodyHtml and bodyText must say the same thing. Don't include CSS or <style> tags.
- Loop IDs should be short kebab-case strings ("consultant-line", "almost-didnt-send"). Reuse existing IDs from the ledger when closing.`;

export function buildGenerationSystemPrompt(voiceSpec: string): string {
  return `${voiceSpec}\n\n${SYSTEM_HOUSE_RULES}`;
}

export function buildGenerationUserPrompt(args: GenerationPromptArgs): string {
  const roleIndex = ROLES.indexOf(args.role);
  const orderLabel = `${roleIndex + 1} of ${ROLES.length}`;

  const openLoops = args.loopLedger.filter((l) => !l.closedInRole);
  const openLoopsBlock =
    openLoops.length === 0
      ? "(none)"
      : openLoops
          .map(
            (l) =>
              `- [${l.id}] opened in ${l.openedInRole}: ${l.description}`,
          )
          .join("\n");

  const priorBlock =
    args.priorDrafts.length === 0
      ? "(this is the first email)"
      : args.priorDrafts
          .map(
            (d) =>
              `===\nROLE: ${d.role}\nSUBJECT: ${d.subject}\nBODY:\n${d.bodyText}\n===`,
          )
          .join("\n\n");

  return `You are writing email ${orderLabel} in a sequence.

Recipient: ${args.recipientFirstName}, ${args.recipientEmail}
Their site: ${args.report.url}
Their ideal customer (their words): ${args.report.customerDescription}

Their full Signal Report:
${JSON.stringify(args.report, null, 2)}

Your role for this email: ${args.role} (${ROLE_LABELS[args.role]})

Brief:
- Purpose: ${args.brief.purpose}
- Required beats: ${args.brief.requiredBeats}
- Tone: ${args.brief.tone}
- Length: ${args.brief.lengthGuide}

Worked example (stylistic anchor only — do not copy):
${args.brief.workedExample}

Loops currently open across this sequence (each must close by the offer; at least one must remain active when this email ends):
${openLoopsBlock}

Loops you must close in this email: ${args.brief.loopsToClose}
Loops you may open in this email: ${args.brief.loopsToOpen}

Previous emails in this sequence (in order, earliest first):
${priorBlock}

Write the email. Use the report findings where they deepen the argument; leave them out where they don't.`;
}
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/email-campaigns/generation-prompt.ts
git commit -m "feat(email-campaigns): add generation prompt builder"
```

---

## Task 9: Generation result schema validator

**Files:**
- Create: `lib/email-campaigns/generation-result.ts`

A pure validator that turns parsed JSON into a typed `GenerationResult` or throws a descriptive error. No `zod` dep — we manually type-check. This is the boundary between the LLM and the rest of the system.

- [ ] **Step 1: Write the file.**

```ts
// lib/email-campaigns/generation-result.ts

export interface GenerationResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  loopsOpened: Array<{ id: string; description: string }>;
  loopsClosed: string[];
  reportFindingsUsed: string[];
}

export class GenerationResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationResultError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateGenerationResult(raw: unknown): GenerationResult {
  if (typeof raw !== "object" || raw === null) {
    throw new GenerationResultError("LLM result is not an object");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.subject !== "string" || r.subject.length === 0) {
    throw new GenerationResultError("subject must be a non-empty string");
  }
  if (typeof r.bodyHtml !== "string" || r.bodyHtml.length === 0) {
    throw new GenerationResultError("bodyHtml must be a non-empty string");
  }
  if (typeof r.bodyText !== "string" || r.bodyText.length === 0) {
    throw new GenerationResultError("bodyText must be a non-empty string");
  }

  if (!Array.isArray(r.loopsOpened)) {
    throw new GenerationResultError("loopsOpened must be an array");
  }
  const loopsOpened: Array<{ id: string; description: string }> = [];
  for (const item of r.loopsOpened) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== "string" ||
      typeof (item as Record<string, unknown>).description !== "string"
    ) {
      throw new GenerationResultError(
        "Each loopsOpened entry must have string id and description",
      );
    }
    loopsOpened.push({
      id: (item as Record<string, string>).id,
      description: (item as Record<string, string>).description,
    });
  }

  if (!isStringArray(r.loopsClosed)) {
    throw new GenerationResultError("loopsClosed must be an array of strings");
  }
  if (!isStringArray(r.reportFindingsUsed)) {
    throw new GenerationResultError(
      "reportFindingsUsed must be an array of strings",
    );
  }

  return {
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    bodyText: r.bodyText,
    loopsOpened,
    loopsClosed: r.loopsClosed,
    reportFindingsUsed: r.reportFindingsUsed,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/email-campaigns/generation-result.ts
git commit -m "feat(email-campaigns): add generation result validator"
```

---

## Task 10: Generation internal action

**Files:**
- Create: `convex/emailCampaignsAction.ts`
- Modify: `convex/emailCampaigns.ts` (add internal mutations the action calls)

The orchestrator. Loops through the 7 roles, builds the prompt, calls OpenRouter with retry/fallback, validates the result, persists the draft via internal mutations, updates the loop ledger.

- [ ] **Step 1: Add the internal mutations to `convex/emailCampaigns.ts`.**

Append:

```ts
import { internalMutation } from "./_generated/server";

export const insertGeneratedDraft = internalMutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    role: roleValidator,
    order: v.number(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    briefVersionUsed: v.number(),
    voiceVersionUsed: v.number(),
    loopsOpenedHere: v.array(v.string()),
    loopsClosedHere: v.array(v.string()),
    reportFindingsUsed: v.array(v.string()),
    unsubscribeToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailDrafts", {
      enrollmentId: args.enrollmentId,
      role: args.role,
      order: args.order,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      status: "draft",
      briefVersionUsed: args.briefVersionUsed,
      voiceVersionUsed: args.voiceVersionUsed,
      loopsOpenedHere: args.loopsOpenedHere,
      loopsClosedHere: args.loopsClosedHere,
      reportFindingsUsed: args.reportFindingsUsed,
      isStale: false,
      editedByDaniel: false,
      unsubscribeToken: args.unsubscribeToken,
    });
  },
});

export const updateEnrollmentLoopLedger = internalMutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    loopLedger: v.array(
      v.object({
        id: v.string(),
        openedInRole: v.string(),
        closedInRole: v.optional(v.string()),
        description: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.enrollmentId, {
      loopLedger: args.loopLedger,
    });
  },
});

export const setEnrollmentStatus = internalMutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    status: v.union(
      v.literal("generating"),
      v.literal("generation_failed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("completed"),
      v.literal("unsubscribed"),
    ),
    generationError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.generationError !== undefined) {
      patch.generationError = args.generationError;
    }
    await ctx.db.patch(args.enrollmentId, patch);
  },
});

export const getEnrollmentForGeneration = internalMutation({
  // Read-only logic but uses internalMutation so the action can call it
  // and read fresh state between steps.
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) return null;
    const lead = await ctx.db.get(enrollment.leadId);
    const report = await ctx.db.get(enrollment.reportId);
    const sequence = await ctx.db.get(enrollment.sequenceId);
    const voiceSpec = await ctx.db
      .query("emailVoiceSpec")
      .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
      .first();
    // Briefs: one per role, fetch each via the precise indexed lookup.
    const briefs: Doc<"emailRoleBriefs">[] = [];
    for (const role of ROLES) {
      const brief = await ctx.db
        .query("emailRoleBriefs")
        .withIndex("by_sequence_role_isCurrent", (q) =>
          q
            .eq("sequenceId", enrollment.sequenceId)
            .eq("role", role)
            .eq("isCurrent", true),
        )
        .first();
      if (brief) briefs.push(brief);
    }
    briefs.sort((a, b) => a.order - b.order);
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", args.enrollmentId),
      )
      .collect();
    drafts.sort((a, b) => a.order - b.order);

    return {
      enrollment,
      lead,
      report,
      sequence,
      voiceSpec,
      briefs,
      drafts,
    };
  },
});
```

- [ ] **Step 2: Create the action file.**

```ts
// convex/emailCampaignsAction.ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  ROLES,
  type Role,
} from "../lib/email-campaigns/roles";
import {
  callOpenRouter,
  parseLlmJson,
  OpenRouterError,
} from "../lib/email-campaigns/openrouter";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  type LoopLedgerEntry,
  type PriorDraft,
  type ReportForPrompt,
} from "../lib/email-campaigns/generation-prompt";
import {
  validateGenerationResult,
  GenerationResultError,
} from "../lib/email-campaigns/generation-result";
import { signUnsubscribeToken } from "../lib/email-campaigns/unsubscribe-token";

const MODEL_PRIMARY = "google/gemini-2.5-flash";
const MODEL_FALLBACK = "qwen/qwen3.6-plus";

export const generateSequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const data = await ctx.runMutation(
      internal.emailCampaigns.getEnrollmentForGeneration,
      { enrollmentId: args.enrollmentId },
    );
    if (!data || !data.enrollment) {
      console.error(
        `generateSequence: enrollment ${args.enrollmentId} not found`,
      );
      return;
    }

    const { enrollment, lead, report, voiceSpec, briefs, drafts } = data;

    if (!lead || !report || !voiceSpec || briefs.length !== ROLES.length) {
      await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
        enrollmentId: args.enrollmentId,
        status: "generation_failed",
        generationError: `Missing dependencies (lead=${!!lead}, report=${!!report}, voiceSpec=${!!voiceSpec}, briefs=${briefs.length})`,
      });
      return;
    }

    const system = buildGenerationSystemPrompt(voiceSpec.body);
    const reportForPrompt: ReportForPrompt = {
      url: report.url,
      customerDescription: report.customerDescription,
      overallScore: report.overallScore,
      gruntTest: report.gruntTest,
      elements: report.elements,
      quickWin: report.quickWin,
      strengths: report.strengths,
      fullSummary: report.fullSummary,
    };

    // Build priorDrafts from any drafts already inserted (e.g. partial regen).
    let priorDrafts: PriorDraft[] = drafts
      .sort((a, b) => a.order - b.order)
      .map((d) => ({
        role: d.role as Role,
        subject: d.subject,
        bodyText: d.bodyText,
      }));

    // Reconstruct the live loop ledger from the enrollment.
    let loopLedger: LoopLedgerEntry[] = [...enrollment.loopLedger];

    const firstNameCandidate =
      lead.firstName?.trim() || lead.name?.split(" ")[0] || "there";

    for (let i = priorDrafts.length; i < ROLES.length; i++) {
      const role = ROLES[i];
      const brief = briefs.find((b) => b.role === role);
      if (!brief) {
        await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
          enrollmentId: args.enrollmentId,
          status: "generation_failed",
          generationError: `No current brief for role ${role}`,
        });
        return;
      }

      const userPrompt = buildGenerationUserPrompt({
        voiceSpec: voiceSpec.body,
        recipientFirstName: firstNameCandidate,
        recipientEmail: lead.email,
        report: reportForPrompt,
        role,
        brief: {
          purpose: brief.purpose,
          requiredBeats: brief.requiredBeats,
          loopsToOpen: brief.loopsToOpen,
          loopsToClose: brief.loopsToClose,
          tone: brief.tone,
          lengthGuide: brief.lengthGuide,
          workedExample: brief.workedExample,
        },
        priorDrafts,
        loopLedger,
      });

      let raw: string;
      try {
        raw = await callOpenRouter({
          model: MODEL_PRIMARY,
          systemPrompt: system,
          userPrompt,
          temperature: 0.7,
          responseFormat: "json_object",
          title: "Dreamfree Email Sequence Generation",
        });
      } catch (primaryErr) {
        const primaryMsg =
          primaryErr instanceof OpenRouterError
            ? primaryErr.message
            : String(primaryErr);
        console.warn(
          `generateSequence primary failed for role=${role} enrollment=${args.enrollmentId}: ${primaryMsg}`,
        );
        try {
          raw = await callOpenRouter({
            model: MODEL_FALLBACK,
            systemPrompt: system,
            userPrompt,
            temperature: 0.7,
            responseFormat: "json_object",
            title: "Dreamfree Email Sequence Generation (fallback)",
          });
        } catch (fallbackErr) {
          const fallbackMsg =
            fallbackErr instanceof OpenRouterError
              ? fallbackErr.message
              : String(fallbackErr);
          await ctx.runMutation(
            internal.emailCampaigns.setEnrollmentStatus,
            {
              enrollmentId: args.enrollmentId,
              status: "generation_failed",
              generationError: `Role ${role}: primary=${primaryMsg}; fallback=${fallbackMsg}`,
            },
          );
          return;
        }
      }

      let result;
      try {
        result = validateGenerationResult(parseLlmJson(raw));
      } catch (err) {
        const msg =
          err instanceof GenerationResultError ? err.message : String(err);
        await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
          enrollmentId: args.enrollmentId,
          status: "generation_failed",
          generationError: `Role ${role} parse: ${msg}. Raw: ${raw.slice(0, 500)}`,
        });
        return;
      }

      // Update loop ledger
      const newlyOpened = result.loopsOpened.map((l) => ({
        id: l.id,
        openedInRole: role,
        description: l.description,
      }));
      loopLedger = [
        ...loopLedger.map((entry) =>
          result.loopsClosed.includes(entry.id) && !entry.closedInRole
            ? { ...entry, closedInRole: role }
            : entry,
        ),
        ...newlyOpened.filter(
          (n) => !loopLedger.some((existing) => existing.id === n.id),
        ),
      ];

      // Insert the draft (with a fake unsubscribe token for now — we'll re-sign
      // with a real draftId after we have the id back. Two-step because the
      // token includes the draft id.)
      const draftId = await ctx.runMutation(
        internal.emailCampaigns.insertGeneratedDraft,
        {
          enrollmentId: args.enrollmentId,
          role,
          order: i,
          subject: result.subject,
          bodyHtml: result.bodyHtml,
          bodyText: result.bodyText,
          briefVersionUsed: brief.version,
          voiceVersionUsed: voiceSpec.version,
          loopsOpenedHere: result.loopsOpened.map((l) => l.id),
          loopsClosedHere: result.loopsClosed,
          reportFindingsUsed: result.reportFindingsUsed,
          unsubscribeToken: "PENDING",
        },
      );

      // Sign the real token now that we have the draft id, and update.
      const realToken = await signUnsubscribeToken({
        enrollmentId: args.enrollmentId,
        draftId,
      });
      await ctx.runMutation(
        internal.emailCampaigns.setDraftUnsubscribeToken,
        { draftId, token: realToken },
      );

      // Persist the updated loop ledger after every successful draft so a
      // partial failure leaves the enrollment in a consistent state we can
      // resume from.
      await ctx.runMutation(
        internal.emailCampaigns.updateEnrollmentLoopLedger,
        { enrollmentId: args.enrollmentId, loopLedger },
      );

      priorDrafts.push({
        role,
        subject: result.subject,
        bodyText: result.bodyText,
      });
    }

    await ctx.runMutation(internal.emailCampaigns.setEnrollmentStatus, {
      enrollmentId: args.enrollmentId,
      status: "pending_approval",
    });

    // Verifier pass scheduled in next task.
    await ctx.scheduler.runAfter(
      0,
      internal.emailCampaignsAction.verifySequence,
      { enrollmentId: args.enrollmentId },
    );
  },
});

// Stub — replaced by Task 11. Without the stub the scheduler call above won't
// typecheck during this commit.
export const verifySequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (_ctx, args) => {
    console.log(
      `verifySequence stub for ${args.enrollmentId} — implemented in next task`,
    );
  },
});
```

- [ ] **Step 3: Add the missing `setDraftUnsubscribeToken` internal mutation.**

Append to `convex/emailCampaigns.ts`:

```ts
export const setDraftUnsubscribeToken = internalMutation({
  args: {
    draftId: v.id("emailDrafts"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.draftId, { unsubscribeToken: args.token });
  },
});
```

- [ ] **Step 4: Verify Convex reloads + typecheck.**

Watch dev server: clean reload.
Run: `npx tsc --noEmit`
Expected: no errors. (If you see "unused variable" warnings about `Doc` etc., they're benign.)

- [ ] **Step 5: Smoke test — manual enrollment + generation.**

Pick an existing successful Signal Report. List them:
```bash
npx convex data signalReports
```
Copy a `_id` where `status` is `success`. Note the `leadId` and `_id` (reportId).

Get the sequence id:
```bash
npx convex data emailSequences
```

Manually create an enrollment row using the Convex dashboard's data browser:
1. Click `emailEnrollments` → `+ Add Document`
2. Paste:
```json
{
  "leadId": "<leadId>",
  "sequenceId": "<sequenceId>",
  "reportId": "<reportId>",
  "status": "generating",
  "voiceVersionUsed": 1,
  "loopLedger": [],
  "enrolledAt": 1700000000000
}
```
3. Save. Copy the new enrollment `_id`.

Run the action:
```bash
npx convex run emailCampaignsAction:generateSequence '{"enrollmentId":"<enrollmentId>"}'
```

Expected: returns nothing (action). Watch the convex dev server logs for: 7 OpenRouter calls completing, then a "verifySequence stub" log line.

- [ ] **Step 6: Verify drafts in dashboard.**

In `emailDrafts`, filter by `enrollmentId`. Expect 7 rows, one per role, in order. Each has:
- A non-empty subject and body
- `briefVersionUsed: 1`, `voiceVersionUsed: 1`
- `unsubscribeToken` is a JWT string (starts with `eyJ`)
- `isStale: false`, `editedByDaniel: false`

In `emailEnrollments`, the row's `status` is now `pending_approval`. `loopLedger` is a non-empty array.

Note: because the voice spec is a stub, the drafts will be low-quality. That's fine — we're verifying mechanics, not voice. The verifier (next task) will flag every draft.

- [ ] **Step 7: Commit.**

```bash
git add convex/emailCampaigns.ts convex/emailCampaignsAction.ts
git commit -m "feat(email-campaigns): add generateSequence action and supporting internal mutations"
```

---

## Task 11: Verifier prompt + action

**Files:**
- Create: `lib/email-campaigns/verifier-prompt.ts`
- Create: `lib/email-campaigns/verifier-result.ts`
- Modify: `convex/emailCampaignsAction.ts` (replace the `verifySequence` stub)
- Modify: `convex/emailCampaigns.ts` (add `setVerificationFlags` internal mutation)

The verifier reads voice spec + all 7 drafts and returns four flag arrays (voice/loops/cheese/factual). If the voice spec contains the stub marker, the verifier deterministically flags every draft as voice-failed (no LLM call needed in that case).

- [ ] **Step 1: Write the verifier prompt builder.**

```ts
// lib/email-campaigns/verifier-prompt.ts
import type { Role } from "./roles";
import { ROLES } from "./roles";

export interface DraftForVerifier {
  role: Role;
  order: number;
  subject: string;
  bodyText: string;
  loopsOpenedHere: string[];
  loopsClosedHere: string[];
  reportFindingsUsed: string[];
}

export interface VerifierPromptArgs {
  voiceSpec: string;
  drafts: DraftForVerifier[];
  reportSummary: string; // short summary of the report findings for the factual check
}

export const VERIFIER_SYSTEM_PROMPT = `You audit a 7-email soap-opera sales sequence for four problems:

1. **Voice** — Has the writing drifted toward generic LLM register? Does it match the voice spec?
2. **Loops** — Does every loop opened across the sequence close by the offer? Is at least one loop active at every point in the sequence (i.e. when each non-final email ends, is there an open loop pulling the reader to the next email)?
3. **Cheese** — Does any draft contain the five cheese markers? Manufactured drama; vague specifics; guru voice; transformation porn; fake reluctance.
4. **Factual** — Does any draft contradict or invent something inconsistent with the report findings?

You return JSON only:
{
  "voice":   [{ "role": "<role>", "note": "..." }],
  "loops":   [{ "role": "<role>", "note": "..." }],
  "cheese":  [{ "role": "<role>", "note": "..." }],
  "factual": [{ "role": "<role>", "note": "..." }]
}

If a category is clean, return an empty array for it. Notes should be one sentence each, pointing to the specific issue. Use "sequence" as the role for whole-sequence issues (e.g. an open loop that never closes).`;

export function buildVerifierUserPrompt(args: VerifierPromptArgs): string {
  const draftsBlock = args.drafts
    .sort((a, b) => a.order - b.order)
    .map((d) => {
      const findings =
        d.reportFindingsUsed.length > 0
          ? d.reportFindingsUsed.join(", ")
          : "(none cited)";
      const opens =
        d.loopsOpenedHere.length > 0
          ? d.loopsOpenedHere.join(", ")
          : "(none)";
      const closes =
        d.loopsClosedHere.length > 0
          ? d.loopsClosedHere.join(", ")
          : "(none)";
      return `=== Email ${d.order + 1}/${ROLES.length} — ${d.role} ===
SUBJECT: ${d.subject}
LOOPS OPENED HERE: ${opens}
LOOPS CLOSED HERE: ${closes}
REPORT FINDINGS CITED: ${findings}
BODY:
${d.bodyText}`;
    })
    .join("\n\n");

  return `Voice spec to check against:
---
${args.voiceSpec}
---

Report summary (factual ground truth):
---
${args.reportSummary}
---

The 7 emails in order:
${draftsBlock}`;
}
```

- [ ] **Step 2: Write the verifier result validator.**

```ts
// lib/email-campaigns/verifier-result.ts

export interface VerifierFlag {
  role: string;
  note: string;
}

export interface VerifierResult {
  voice: VerifierFlag[];
  loops: VerifierFlag[];
  cheese: VerifierFlag[];
  factual: VerifierFlag[];
}

export class VerifierResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifierResultError";
  }
}

function asFlagArray(raw: unknown, label: string): VerifierFlag[] {
  if (!Array.isArray(raw)) {
    throw new VerifierResultError(`${label} must be an array`);
  }
  return raw.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).role !== "string" ||
      typeof (item as Record<string, unknown>).note !== "string"
    ) {
      throw new VerifierResultError(
        `${label} entries must have string role and note`,
      );
    }
    return {
      role: (item as Record<string, string>).role,
      note: (item as Record<string, string>).note,
    };
  });
}

export function validateVerifierResult(raw: unknown): VerifierResult {
  if (typeof raw !== "object" || raw === null) {
    throw new VerifierResultError("Verifier result is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    voice: asFlagArray(r.voice, "voice"),
    loops: asFlagArray(r.loops, "loops"),
    cheese: asFlagArray(r.cheese, "cheese"),
    factual: asFlagArray(r.factual, "factual"),
  };
}
```

- [ ] **Step 3: Add the `setVerificationFlags` internal mutation to `convex/emailCampaigns.ts`.**

Append:

```ts
const flagArrayValidator = v.array(
  v.object({ role: v.string(), note: v.string() }),
);

export const setVerificationFlags = internalMutation({
  args: {
    enrollmentId: v.id("emailEnrollments"),
    flags: v.object({
      voice: flagArrayValidator,
      loops: flagArrayValidator,
      cheese: flagArrayValidator,
      factual: flagArrayValidator,
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.enrollmentId, {
      verificationFlags: args.flags,
    });
  },
});
```

- [ ] **Step 4: Replace the `verifySequence` stub in `convex/emailCampaignsAction.ts` with the real implementation.**

Replace the stub at the bottom of the file with:

```ts
// Add VOICE_SPEC_STUB_MARKER to the existing ROLES import at the top of
// convex/emailCampaignsAction.ts — it should now read:
//   import { ROLES, VOICE_SPEC_STUB_MARKER, type Role } from "../lib/email-campaigns/roles";

import {
  VERIFIER_SYSTEM_PROMPT,
  buildVerifierUserPrompt,
  type DraftForVerifier,
} from "../lib/email-campaigns/verifier-prompt";
import {
  validateVerifierResult,
  VerifierResultError,
} from "../lib/email-campaigns/verifier-result";

const VERIFIER_TEMPERATURE = 0.2;

function makeStubVoiceFlags(drafts: DraftForVerifier[]): {
  voice: { role: string; note: string }[];
  loops: never[];
  cheese: never[];
  factual: never[];
} {
  return {
    voice: drafts.map((d) => ({
      role: d.role,
      note: "Voice spec is still the stub. Fill it in before approving.",
    })),
    loops: [],
    cheese: [],
    factual: [],
  };
}

export const verifySequence = internalAction({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const data = await ctx.runMutation(
      internal.emailCampaigns.getEnrollmentForGeneration,
      { enrollmentId: args.enrollmentId },
    );
    if (!data || !data.enrollment || !data.voiceSpec || !data.report) {
      console.error(`verifySequence: missing data for ${args.enrollmentId}`);
      return;
    }

    const draftsForVerifier: DraftForVerifier[] = data.drafts
      .sort((a, b) => a.order - b.order)
      .map((d) => ({
        role: d.role as Role,
        order: d.order,
        subject: d.subject,
        bodyText: d.bodyText,
        loopsOpenedHere: d.loopsOpenedHere,
        loopsClosedHere: d.loopsClosedHere,
        reportFindingsUsed: d.reportFindingsUsed,
      }));

    if (draftsForVerifier.length !== ROLES.length) {
      console.warn(
        `verifySequence: expected ${ROLES.length} drafts, got ${draftsForVerifier.length} — skipping`,
      );
      return;
    }

    // Voice spec stub short-circuit
    if (data.voiceSpec.body.includes(VOICE_SPEC_STUB_MARKER)) {
      const stubFlags = makeStubVoiceFlags(draftsForVerifier);
      await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
        enrollmentId: args.enrollmentId,
        flags: stubFlags,
      });
      return;
    }

    const reportSummary = `URL: ${data.report.url}
Customer: ${data.report.customerDescription}
Overall: ${data.report.overallScore}/100
Grunt test: ${data.report.gruntTest.pass ? "pass" : "fail"} — ${data.report.gruntTest.explanation}
Quick win: ${data.report.quickWin}
Strengths: ${data.report.strengths.join("; ")}
Full summary: ${data.report.fullSummary}`;

    const userPrompt = buildVerifierUserPrompt({
      voiceSpec: data.voiceSpec.body,
      drafts: draftsForVerifier,
      reportSummary,
    });

    let raw: string;
    try {
      raw = await callOpenRouter({
        model: MODEL_PRIMARY,
        systemPrompt: VERIFIER_SYSTEM_PROMPT,
        userPrompt,
        temperature: VERIFIER_TEMPERATURE,
        responseFormat: "json_object",
        title: "Dreamfree Email Verifier",
      });
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof OpenRouterError
          ? primaryErr.message
          : String(primaryErr);
      console.warn(`verifySequence primary failed: ${primaryMsg}`);
      try {
        raw = await callOpenRouter({
          model: MODEL_FALLBACK,
          systemPrompt: VERIFIER_SYSTEM_PROMPT,
          userPrompt,
          temperature: VERIFIER_TEMPERATURE,
          responseFormat: "json_object",
          title: "Dreamfree Email Verifier (fallback)",
        });
      } catch (fallbackErr) {
        const fallbackMsg =
          fallbackErr instanceof OpenRouterError
            ? fallbackErr.message
            : String(fallbackErr);
        console.error(
          `verifySequence both models failed for ${args.enrollmentId}: primary=${primaryMsg}; fallback=${fallbackMsg}`,
        );
        // Don't fail the enrollment — verification is informational. Persist
        // a synthetic flag noting the verifier itself failed.
        await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
          enrollmentId: args.enrollmentId,
          flags: {
            voice: [
              {
                role: "sequence",
                note: `Verifier LLM failed: ${fallbackMsg}. Approve manually with caution.`,
              },
            ],
            loops: [],
            cheese: [],
            factual: [],
          },
        });
        return;
      }
    }

    let result;
    try {
      result = validateVerifierResult(parseLlmJson(raw));
    } catch (err) {
      const msg = err instanceof VerifierResultError ? err.message : String(err);
      console.error(`verifySequence parse error: ${msg}`);
      await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
        enrollmentId: args.enrollmentId,
        flags: {
          voice: [{ role: "sequence", note: `Verifier parse failed: ${msg}` }],
          loops: [],
          cheese: [],
          factual: [],
        },
      });
      return;
    }

    await ctx.runMutation(internal.emailCampaigns.setVerificationFlags, {
      enrollmentId: args.enrollmentId,
      flags: result,
    });
  },
});
```

- [ ] **Step 5: Verify Convex reloads + typecheck.**

Watch dev server. Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Smoke test — re-run on the existing enrollment.**

Run: `npx convex run emailCampaignsAction:verifySequence '{"enrollmentId":"<enrollmentId from Task 10>"}'`

Expected: log line in the dev server. The enrollment's `verificationFlags` field is now populated. Because the voice spec is still the stub, the `voice` array has 7 entries (one per role) saying "Voice spec is still the stub..." and the other arrays are empty.

- [ ] **Step 7: Commit.**

```bash
git add lib/email-campaigns/verifier-prompt.ts lib/email-campaigns/verifier-result.ts convex/emailCampaigns.ts convex/emailCampaignsAction.ts
git commit -m "feat(email-campaigns): add verifier pass with stub-voice short-circuit"
```

---

## Task 12: Trigger hook in signalReportsAction

**Files:**
- Modify: `convex/signalReportsAction.ts`
- Modify: `convex/emailCampaigns.ts` (add `tryEnrolFromReport` internal mutation)

After a successful report, attempt to enrol the lead. The mutation handles all the guard logic (sequence active? lead suppressed? lead already has an active enrollment?) atomically. Action layer just calls it and schedules generation if an enrollmentId is returned.

- [ ] **Step 1: Add the `tryEnrolFromReport` internal mutation to `convex/emailCampaigns.ts`.**

Append:

```ts
export const tryEnrolFromReport = internalMutation({
  args: {
    reportId: v.id("signalReports"),
  },
  returns: v.union(v.id("emailEnrollments"), v.null()),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) {
      console.warn(`tryEnrolFromReport: report ${args.reportId} not found`);
      return null;
    }
    if (report.status !== "success") {
      console.warn(
        `tryEnrolFromReport: report ${args.reportId} status=${report.status}, skipping`,
      );
      return null;
    }

    const lead = await ctx.db.get(report.leadId);
    if (!lead) {
      console.warn(`tryEnrolFromReport: lead ${report.leadId} not found`);
      return null;
    }

    // Suppression guard — exact email match
    const suppression = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .first();
    if (suppression) {
      console.log(
        `tryEnrolFromReport: ${lead.email} suppressed (${suppression.reason}), skipping`,
      );
      return null;
    }

    // Active sequence guard — block if any prior enrollment is active for this lead
    const existing = await ctx.db
      .query("emailEnrollments")
      .withIndex("by_leadId", (q) => q.eq("leadId", report.leadId))
      .collect();
    const blocking = existing.find((e) =>
      [
        "generating",
        "pending_approval",
        "approved",
        "paused",
      ].includes(e.status),
    );
    if (blocking) {
      console.log(
        `tryEnrolFromReport: lead ${report.leadId} already has enrollment ${blocking._id} status=${blocking.status}, skipping`,
      );
      return null;
    }

    // Sequence active guard
    const sequence = await ctx.db
      .query("emailSequences")
      .withIndex("by_trigger", (q) => q.eq("trigger", "signal_report_success"))
      .first();
    if (!sequence || !sequence.isActive) {
      console.log(
        `tryEnrolFromReport: no active sequence for signal_report_success, skipping`,
      );
      return null;
    }

    const voiceSpec = await ctx.db
      .query("emailVoiceSpec")
      .withIndex("by_isCurrent", (q) => q.eq("isCurrent", true))
      .first();
    if (!voiceSpec) {
      console.error(`tryEnrolFromReport: no current voice spec, skipping`);
      return null;
    }

    const enrollmentId = await ctx.db.insert("emailEnrollments", {
      leadId: report.leadId,
      sequenceId: sequence._id,
      reportId: args.reportId,
      status: "generating",
      voiceVersionUsed: voiceSpec.version,
      loopLedger: [],
      enrolledAt: Date.now(),
    });

    return enrollmentId;
  },
});
```

- [ ] **Step 2: Modify `convex/signalReportsAction.ts` to call the trigger.**

Open `convex/signalReportsAction.ts`. Find the block right after the `emailResults.forEach` block at line ~195 (just before the final `console.log`). Add:

```ts
    // Attempt to enrol the lead in the email campaign sequence (post-report).
    // Failures here must not affect the report itself — log only.
    try {
      const enrollmentId = await ctx.runMutation(
        internal.emailCampaigns.tryEnrolFromReport,
        { reportId: args.reportId },
      );
      if (enrollmentId) {
        await ctx.scheduler.runAfter(
          0,
          internal.emailCampaignsAction.generateSequence,
          { enrollmentId },
        );
        console.log(
          `Email campaign enrolment scheduled for report ${args.reportId} → enrollment ${enrollmentId}`,
        );
      }
    } catch (err) {
      console.error(
        `Email campaign enrolment failed for report ${args.reportId}:`,
        err,
      );
    }
```

- [ ] **Step 3: Verify Convex reloads + typecheck.**

Watch dev server. Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke test — generate a real Signal Report end-to-end.**

In a browser, go to your dev URL (typically `http://localhost:3000`) and submit a Signal Score for any URL with a real email address you control.

Wait for the report to complete (~30-60s). Watch the convex dev server logs for:
- The existing report-completion logs
- A new log line: `Email campaign enrolment scheduled for report ... → enrollment ...`
- 7 OpenRouter calls (one per role)
- A verifier call (or stub-flagging if voice spec is still stub)

In the Convex dashboard, verify:
- A new `emailEnrollments` row with `status: pending_approval`, `verificationFlags` populated.
- 7 corresponding `emailDrafts` rows.

- [ ] **Step 5: Smoke test — duplicate trigger guard.**

Generate another Signal Report for the *same email address* (same lead). Watch logs for:
`tryEnrolFromReport: lead ... already has enrollment ... status=pending_approval, skipping`

Verify in dashboard: only the original enrollment exists; no new one created.

- [ ] **Step 6: Commit.**

```bash
git add convex/emailCampaigns.ts convex/signalReportsAction.ts
git commit -m "feat(email-campaigns): trigger enrolment after successful Signal Report"
```

---

## Task 13: Inspection queries

**Files:**
- Modify: `convex/emailCampaigns.ts`

A small set of read-only queries for sanity-checking the system from the CLI before Plan 2's UI exists. Plan 2 will use these queries (and add more), so they're not throwaway.

- [ ] **Step 1: Add the queries to `convex/emailCampaigns.ts`.**

Append:

```ts
export const listEnrollments = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("generating"),
        v.literal("generation_failed"),
        v.literal("pending_approval"),
        v.literal("approved"),
        v.literal("paused"),
        v.literal("stopped"),
        v.literal("completed"),
        v.literal("unsubscribed"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const q = args.status
      ? ctx.db
          .query("emailEnrollments")
          .withIndex("by_status", (qb) => qb.eq("status", args.status!))
      : ctx.db.query("emailEnrollments");
    return await q.order("desc").take(limit);
  },
});

export const getEnrollmentWithDrafts = query({
  args: { enrollmentId: v.id("emailEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) return null;
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_enrollment", (q) =>
        q.eq("enrollmentId", args.enrollmentId),
      )
      .collect();
    drafts.sort((a, b) => a.order - b.order);
    const lead = await ctx.db.get(enrollment.leadId);
    const report = await ctx.db.get(enrollment.reportId);
    return { enrollment, drafts, lead, report };
  },
});

export const getCampaignConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("campaignConfig").first();
  },
});
```

- [ ] **Step 2: Verify Convex reloads + typecheck.**

Watch dev server. Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke test the queries.**

```bash
npx convex run emailCampaigns:listEnrollments '{}'
```
Expected: array of enrollment rows.

```bash
npx convex run emailCampaigns:getEnrollmentWithDrafts '{"enrollmentId":"<paste id>"}'
```
Expected: object with `{ enrollment, drafts (7 rows), lead, report }`.

```bash
npx convex run emailCampaigns:getCampaignConfig '{}'
```
Expected: the campaign config row with `globalKillSwitch: true`.

- [ ] **Step 4: Commit.**

```bash
git add convex/emailCampaigns.ts
git commit -m "feat(email-campaigns): add admin inspection queries"
```

---

## Task 14: End-to-end verification & polish

**Files:**
- Read-only

A final pass to confirm the foundations are solid before Plan 2.

- [ ] **Step 1: Generate one report against a real-looking URL.**

Pick a URL of one of Daniel's prospects (or any small business website). In dev, submit a Signal Score with a test email. Wait for completion.

- [ ] **Step 2: Inspect the generated drafts.**

Run:
```bash
npx convex run emailCampaigns:listEnrollments '{"status":"pending_approval","limit":1}'
```
Copy the enrollment `_id`. Then:
```bash
npx convex run emailCampaigns:getEnrollmentWithDrafts '{"enrollmentId":"<id>"}'
```

Read each draft's `subject` and `bodyText`. They will be poor quality (voice spec is still stub) but should be:
- Coherent English
- Reference the prospect's URL and at least one report finding
- Have non-empty loops fields
- Different across the 7 roles (orientation reads like an introduction; offer reads like a pitch)

If any of these fail systemically, the prompt builder or LLM call is wrong — debug before declaring Plan 1 done.

- [ ] **Step 3: Inspect the verifier flags.**

In the same `getEnrollmentWithDrafts` output, the `verificationFlags.voice` field should have 7 entries (the stub-voice flag). Other categories should be empty.

- [ ] **Step 4: Generate a second report with a different lead and confirm parallel enrollments work.**

Submit a Signal Score with a *different* email. Wait for completion.

```bash
npx convex run emailCampaigns:listEnrollments '{"limit":5}'
```

Expected: at least two enrollments, each `pending_approval` with their own 7 drafts.

- [ ] **Step 5: Update CLAUDE.md if needed.**

Plan 1 introduces the `lib/email-campaigns/` directory and the `convex/emailCampaigns.ts` + `convex/emailCampaignsAction.ts` files. The existing project CLAUDE.md doesn't list specific files, so probably no changes needed. If the project CLAUDE.md mentions module-by-module conventions, add a short note pointing to the spec.

Read: `cat CLAUDE.md`
If a file-organisation section exists, add a single line:
```
- `convex/emailCampaigns.ts` + `convex/emailCampaignsAction.ts` — soap-opera email sequence backend (see docs/superpowers/specs/2026-05-06-personalised-email-campaigns-design.md)
```

If no such section exists, skip this step.

- [ ] **Step 6: Final commit (only if anything changed in step 5).**

```bash
git status
# If CLAUDE.md was modified:
git add CLAUDE.md
git commit -m "docs: note email campaigns modules in CLAUDE.md"
```

- [ ] **Step 7: Push to remote.**

```bash
git push
```

Plan 1 done. The system now:
- Generates a 7-email sequence end-to-end when a Signal Report completes
- Stores drafts with full provenance (brief version, voice version, loops, findings)
- Runs a verifier pass and records flags
- Honours suppression and duplicate-enrollment guards
- Is editable via voice/brief mutations (with stale-flagging on existing drafts)

Plan 2 builds the dashboard UI on top of this. Plan 3 wires sending and unsubscribe.
