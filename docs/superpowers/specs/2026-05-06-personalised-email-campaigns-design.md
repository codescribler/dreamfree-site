# Personalised Soap Opera Email Campaigns — Design Spec

**Date:** 2026-05-06
**Status:** Approved, pending implementation plan

## Goal

Build an automated email sequence triggered when a prospect generates a Signal Report at dreamfree.co.uk. The report itself is the lead magnet; the sequence converts the lead into a client.

Every email is contextually rewritten by an LLM for the specific recipient using their report findings, written against a structural brief, and held to a voice spec. The sequence follows the Soap Opera Sequence framework — a serialised story arc (orientation → backstory → wall → epiphany → application → hidden benefits → offer) with deliberate open loops that pull the reader from one email to the next.

Daniel must be able to:

- See aggregate stats for the campaign (active sequences, sends, opens, clicks, replies, unsubscribes, completed)
- Click into any prospect's enrollment and see, edit, regenerate, pause, or stop their drafts
- Edit the voice spec and the per-role briefs in the dashboard
- Approve every prospect's full sequence before any email sends (per-enrollment approval queue)
- Flip a global kill switch that blocks all sends without losing queued drafts

A reply pauses the sequence (manually flagged by Daniel for v1). An unsubscribe halts the sequence permanently and adds the email to a global suppression list.

## Non-goals (deferred)

- Variants by score band (single sequence in v1)
- Resend inbound webhooks for auto-pause on reply (manual pause only)
- The `mailto:` form of the `List-Unsubscribe` header (https-only for v1)
- A welcome sequence on conversion to client
- A/B testing of subject lines
- Cohort retention or attribution analytics beyond the dashboard counters

## Decisions log

The following choices were made during brainstorming and bind the design:

1. **Build everything in one spec** — control plane *and* the LLM personalisation engine.
2. **Voice spec and briefs live in the database**, edited in the dashboard. Save bumps version.
3. **Two-layer gate:** global kill switch + per-enrollment approval queue. No per-sequence "draft/live" status, no per-email approval. System ships with kill switch OFF.
4. **One sequence for everyone in v1.** Personalisation comes from the LLM rewriting against the report.
5. **Manual reply pause.** Big red "Pause — they replied" button on the per-enrollment view.
6. **Voice/brief edits affect future enrollments only.** Already-pending drafts get a `stale` badge and a manual "Regenerate" button. Edits never auto-regenerate.
7. **Cadence is gap-after-previous, scheduled reactively.** Each draft schedules the next one only after it sends. No past-due cascading.

## Architecture

### Routing

| Path | Type | Purpose |
|---|---|---|
| `/dashboard/email-campaigns` | Next.js page | Campaign overview + stats + queues |
| `/dashboard/email-campaigns/sequence` | Next.js page | Edit sequence cadence, briefs, voice spec |
| `/dashboard/email-campaigns/enrollments/[id]` | Next.js page | Per-prospect drafts + actions |
| `/api/email-campaigns/resend-webhook` | Next.js route handler (POST) | Receives Resend delivery/open/click/bounce events |
| `/unsubscribe` | Next.js page | Public one-click unsubscribe (token-based) |

`middleware.ts` already protects `/dashboard/:path*` with admin auth — all three dashboard pages inherit that. The webhook and unsubscribe routes are public.

### Layout change

Add `Email Campaigns` as a third tab in `app/dashboard/DashboardNav.tsx`:

- Leads (`/dashboard`)
- Insights (`/dashboard/insights`)
- Email Campaigns (`/dashboard/email-campaigns`)

## Data model

All new tables are added to `convex/schema.ts`. The existing scaffolded tables (`emailSequences`, `emailSequenceSteps`, `emailEnrollments`, `emailSends`) are extended where relevant; `emailSequenceSteps` is replaced by `emailRoleBriefs` (per-sequence template) and `emailDrafts` (per-recipient generated email) since the per-recipient case wasn't anticipated in the original scaffold.

### `campaignConfig` (new — single-row config doc)

```ts
campaignConfig: defineTable({
  globalKillSwitch: v.boolean(),         // ships true (off)
  killSwitchNote: v.optional(v.string()), // why it was flipped off
  killSwitchUpdatedAt: v.number(),
  fromAddress: v.string(),                // "Daniel at Dreamfree <daniel@dreamfree.co.uk>"
  defaultLlmModel: v.string(),            // "google/gemini-2.5-flash"
  businessHoursEnabled: v.boolean(),      // ships true
  businessHoursStartUtcMinutes: v.number(), // 9*60 for 09:00 Europe/London (handle BST in code)
  businessHoursEndUtcMinutes: v.number(),   // 18*60
  businessDays: v.array(v.number()),       // [1,2,3,4,5] = Mon-Fri
  unsubscribeBaseUrl: v.string(),          // "https://dreamfree.co.uk/unsubscribe"
})
```

Read by every send. There's only ever one row.

### `emailVoiceSpec` (new — append-only version history)

```ts
emailVoiceSpec: defineTable({
  body: v.string(),               // the full voice spec doc, plain text or markdown
  version: v.number(),             // monotonically increasing
  isCurrent: v.boolean(),          // exactly one row has true
  createdAt: v.number(),
  createdBy: v.string(),           // user email
}).index("by_isCurrent", ["isCurrent"])
  .index("by_version", ["version"])
```

Every save inserts a new row, flips the previous current row's `isCurrent` to false, and sets the new row's `isCurrent` to true. Drafts snapshot the version they were generated against in `emailDrafts.voiceVersionUsed`.

### `emailSequences` (extends scaffold)

```ts
emailSequences: defineTable({
  name: v.string(),                // "Signal Report Soap Opera"
  description: v.optional(v.string()),
  trigger: v.string(),             // "signal_report_success"
  isActive: v.boolean(),           // false disables new enrollments at trigger time
  // Per-role gap-after-previous in milliseconds. Length must equal ROLES.length.
  roleGaps: v.array(v.number()),
  // Whether the orientation email respects business hours or fires immediately.
  orientationRespectsBusinessHours: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_trigger", ["trigger"])
```

Defaults seeded on first install:

| Index | Role | Gap from previous |
|---|---|---|
| 0 | orientation | 0 (fires `max(now, triggerTime + 2min)` on approval) |
| 1 | backstory | +1 day |
| 2 | wall | +1 day |
| 3 | epiphany | +2 days |
| 4 | application | +2 days |
| 5 | hidden_benefits | +3 days |
| 6 | offer | +3 days |

### `emailRoleBriefs` (new — per-role brief, edited by Daniel)

```ts
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
  order: v.number(),               // 0..6
  purpose: v.string(),
  requiredBeats: v.string(),       // free-form
  loopsToOpen: v.string(),         // guidance for what loops to open
  loopsToClose: v.string(),        // which previously-opened loops must close here
  tone: v.string(),
  lengthGuide: v.string(),         // "120-180 words" or similar
  workedExample: v.string(),       // a complete example email in Daniel's voice
  version: v.number(),             // bumps on save
  isCurrent: v.boolean(),
  createdAt: v.number(),
  createdBy: v.string(),
})
  .index("by_sequence_role_isCurrent", ["sequenceId", "role", "isCurrent"])
  .index("by_sequence_role_version", ["sequenceId", "role", "version"])
```

Same versioning pattern as voice spec. Drafts snapshot the brief version in `emailDrafts.briefVersionUsed`.

Seeded with skeleton briefs (purpose + structural beats + length guide) — Daniel writes the actual `workedExample` and refines.

### `emailEnrollments` (extends scaffold)

```ts
emailEnrollments: defineTable({
  leadId: v.id("leads"),
  sequenceId: v.id("emailSequences"),
  reportId: v.id("signalReports"),
  status: v.union(
    v.literal("generating"),       // initial drafts being created
    v.literal("generation_failed"),// LLM failure during initial generation
    v.literal("pending_approval"), // ready for Daniel to review
    v.literal("approved"),         // sends queued / in-flight
    v.literal("paused"),           // resumable (replied / manual)
    v.literal("stopped"),          // terminal (manual)
    v.literal("completed"),        // offer sent successfully
    v.literal("unsubscribed"),     // recipient pulled the plug
  ),
  pausedReason: v.optional(v.union(
    v.literal("replied"),
    v.literal("manual"),
  )),
  voiceVersionUsed: v.number(),     // snapshot at first generation
  // Live loop ledger maintained by each draft generation.
  // Each entry: { id, openedInRole, closedInRole?, description }
  loopLedger: v.array(v.object({
    id: v.string(),
    openedInRole: v.string(),
    closedInRole: v.optional(v.string()),
    description: v.string(),
  })),
  // Verification flags from the post-generation pass; informational, not blocking.
  verificationFlags: v.optional(v.object({
    voice: v.array(v.object({ role: v.string(), note: v.string() })),
    loops: v.array(v.object({ role: v.string(), note: v.string() })),
    cheese: v.array(v.object({ role: v.string(), note: v.string() })),
    factual: v.array(v.object({ role: v.string(), note: v.string() })),
  })),
  enrolledAt: v.number(),
  approvedAt: v.optional(v.number()),
  pausedAt: v.optional(v.number()),
  stoppedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_leadId", ["leadId"])
  .index("by_sequenceId", ["sequenceId"])
  .index("by_status", ["status"])
  .index("by_reportId", ["reportId"])
```

### `emailDrafts` (new — replaces `emailSequenceSteps` for the per-recipient case)

```ts
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
  order: v.number(),               // 0..6, matches role order
  subject: v.string(),
  bodyHtml: v.string(),
  bodyText: v.string(),            // plain-text alt for Resend
  // Set when this draft becomes the "next to send" — only one draft per enrollment is scheduled at a time.
  scheduledFor: v.optional(v.number()),
  scheduledFunctionId: v.optional(v.string()), // returned by ctx.scheduler.runAt for cancellation
  sentAt: v.optional(v.number()),
  status: v.union(
    v.literal("draft"),            // generated, not yet scheduled
    v.literal("scheduled"),        // ctx.scheduler.runAt registered
    v.literal("sent"),
    v.literal("failed"),           // Resend error after retries
    v.literal("skipped_terminal"), // enrollment was paused/stopped/unsubscribed when send fired
    v.literal("skipped_suppressed"), // recipient on suppression list at send time
  ),
  // LLM provenance
  briefVersionUsed: v.number(),
  voiceVersionUsed: v.number(),
  loopsOpenedHere: v.array(v.string()),  // loop ids
  loopsClosedHere: v.array(v.string()),
  reportFindingsUsed: v.array(v.string()), // human-readable list from the LLM
  // Editing state
  isStale: v.boolean(),            // brief or voice updated after generation
  editedByDaniel: v.boolean(),     // human edited subject or body — drives cascade-regen
  // Per-draft unsubscribe token (scoped to this enrollment)
  unsubscribeToken: v.string(),
})
  .index("by_enrollment", ["enrollmentId"])
  .index("by_status", ["status"])
  .index("by_unsubscribeToken", ["unsubscribeToken"])
```

### `emailSends` (extends scaffold)

```ts
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
  .index("by_resendId", ["resendId"])
```

### `emailSuppressions` (new — global suppression list, source of truth)

```ts
emailSuppressions: defineTable({
  email: v.string(),
  reason: v.union(
    v.literal("unsubscribed"),
    v.literal("bounced"),
    v.literal("complained"),
    v.literal("manual"),
  ),
  suppressedAt: v.number(),
  // Optional context
  enrollmentId: v.optional(v.id("emailEnrollments")),
  note: v.optional(v.string()),
}).index("by_email", ["email"])
```

A single match here permanently blocks any send from `sendDraft`. Permanent unless removed manually (which has its own admin action — rare).

## Generation pipeline

### Trigger

In `convex/signalReportsAction.ts`, after the existing `sendSignalScoreToVisitor` call when a report completes with `status === "success"`:

1. Skip if the lead's email is already in `emailSuppressions` → noop, log only.
2. Skip if the lead has any enrollment in `pending_approval | approved | paused` → noop, log "duplicate trigger guard."
3. Otherwise: insert an `emailEnrollments` row with `status: "generating"`, snapshot current `voiceVersionUsed`, and schedule `internal.emailCampaigns.generateSequence({ enrollmentId })` to run immediately.

### `generateSequence` action (Convex internal action)

Loops through the 7 roles in order. For each:

1. Read the current `emailRoleBriefs` row for `(sequenceId, role)` and the current `emailVoiceSpec`.
2. Read all already-generated drafts for this enrollment (in role order) — these are the "previous emails."
3. Read the enrollment's current `loopLedger`.
4. Build the prompt (see below) and call OpenRouter with `campaignConfig.defaultLlmModel`.
5. Parse the JSON response, validate against the expected shape.
6. Insert the `emailDrafts` row (status `draft`, briefVersionUsed + voiceVersionUsed snapshotted, loopsOpenedHere/loopsClosedHere recorded).
7. Update the enrollment's `loopLedger` — append entries for newly opened loops, update `closedInRole` for closed ones.
8. Generate a per-draft `unsubscribeToken` (HMAC-signed `{ enrollmentId, draftId }` using `process.env.UNSUBSCRIBE_SIGNING_SECRET`).

After all 7 drafts are generated:

9. Run the verification pass (single LLM call — see below).
10. Persist the verification flags on the enrollment.
11. Flip enrollment status to `pending_approval`.

If any LLM call fails after 3 retries: enrollment status → `generation_failed`, surface in the dashboard.

### Per-draft generation prompt

```
SYSTEM:
<voice spec body verbatim>

You write JSON only. Output schema:
{
  "subject": string,
  "bodyHtml": string,
  "bodyText": string,
  "loopsOpened": [{ "id": string, "description": string }],
  "loopsClosed": [string],   // ids of previously open loops you closed in this email
  "reportFindingsUsed": [string]  // short labels: "grunt-test pass", "weak CTA copy", etc.
}

House rules:
- No manufactured drama, vague specifics, guru voice, transformation porn, or fake reluctance.
- Personalisation must do argumentative work, not decorative work. If you can remove the report-derived line and the argument doesn't weaken, leave it out.
- Read it aloud. Would Daniel say it that way to a friend at the pub? If not, cut it.

USER:
You are writing email <order+1> of 7 in a sequence.

Recipient: <firstName>, <email>
Their site: <reportUrl>

Their full Signal Report:
<JSON.stringify(signalReport)>

Your role for this email: <role>

Brief:
- Purpose: <brief.purpose>
- Required beats: <brief.requiredBeats>
- Tone: <brief.tone>
- Length: <brief.lengthGuide>

Worked example (stylistic anchor only — do not copy):
<brief.workedExample>

Loops currently open across this sequence (each must close by the offer; at least one must remain active when this email ends):
<for each loop in ledger where closedInRole is null: "- [{id}] opened in {openedInRole}: {description}">

Loops you must close in this email: <brief.loopsToClose>
Loops you may open in this email: <brief.loopsToOpen>

Previous emails in this sequence (most recent last, full subject + body):
<for each prior draft in order: "===\nSubject: {subject}\nBody:\n{bodyText}\n===">

Write the email. Use the report findings where they deepen the argument; leave them out where they don't.
```

### Verification pass prompt

A second LLM call after all 7 drafts exist. Sends voice spec + all 7 drafts + a verifier system prompt. Returns:

```
{
  "voice": [{ "role": string, "note": string }],
  "loops": [{ "role": string, "note": string }],
  "cheese": [{ "role": string, "note": string }],
  "factual": [{ "role": string, "note": string }]
}
```

Persisted to `emailEnrollments.verificationFlags`. Flags are warnings, not blocks. Daniel can approve with flags; they're informational.

### Edit-cascade (Daniel edits a draft)

When Daniel saves an edited subject or body via the per-enrollment view:

1. Update the draft (`editedByDaniel: true`, `isStale: false`).
2. Mark drafts `order > N` with `isStale: true`.
3. Show "Regenerate later drafts" button on the enrollment view.

Clicking that button runs a partial `generateSequence` starting from `order = N+1`, with the edited draft N now in the prior-emails context. Re-runs verification pass on the full sequence afterward.

### Stale flagging on voice/brief edits

When `emailVoiceSpec` saves a new version, or an `emailRoleBriefs` row saves a new version: update all `emailDrafts` rows in `pending_approval | approved` enrollments where `voiceVersionUsed < newVersion` (or `briefVersionUsed < newVersion` for the affected role) and set `isStale: true`. Sent drafts are never marked stale (they shipped — what's done is done).

This is a Convex mutation triggered as part of the brief/voice save action, not a webhook. Bounded by the number of pending+approved enrollments × 7, in the order of dozens — fine for a single mutation.

The dashboard shows stale counts and a "Regenerate stale drafts" action per enrollment.

## Scheduler & sending

### On approval

Daniel clicks "Approve" on a `pending_approval` enrollment.

1. Compute orientation `scheduledFor`:
   - Base: `max(now, triggerTime + 2 * 60_000)`
   - If `sequence.orientationRespectsBusinessHours`, clamp to next business-hours window.
2. `scheduledFunctionId = ctx.scheduler.runAt(scheduledFor, internal.emailCampaigns.sendDraft, { draftId: orientationDraftId })`
3. Update orientation draft: `status: "scheduled"`, `scheduledFor`, `scheduledFunctionId`.
4. Enrollment status → `approved`, `approvedAt: now`.

Drafts 2–7 are not scheduled at this point. They get scheduled one at a time, by `sendDraft` itself, after the previous draft sends successfully.

### `sendDraft` action — the chokepoint

Every send must pass through this action. Order matters:

```
1. Read draft + enrollment + campaignConfig.
2. If campaignConfig.globalKillSwitch === true:
     - Reschedule self for now + 1h via ctx.scheduler.runAt.
     - Update draft.scheduledFor.
     - Return.
3. If enrollment.status in {paused, stopped, unsubscribed, completed, generation_failed}:
     - Mark draft status: skipped_terminal.
     - Return.
4. If draft.editedByDaniel === true and any later draft has isStale === true:
     - Mark draft status: skipped_terminal.
     - Set enrollment.status = paused, pausedReason = manual, with a flag "stale-cascade-block".
     - Return. (Belt-and-braces — UI surfaces this loudly.)
5. If lead's email is in emailSuppressions:
     - Mark draft status: skipped_suppressed.
     - Set enrollment.status = unsubscribed.
     - Return.
6. Send via Resend:
     - From: campaignConfig.fromAddress
     - To: lead.email
     - Subject: draft.subject
     - HTML: draft.bodyHtml + unsubscribe footer
     - Text: draft.bodyText + unsubscribe footer
     - Headers: List-Unsubscribe + List-Unsubscribe-Post (https one-click)
     - Tags: enrollmentId, draftId, role
   On success:
     - Insert emailSends row (status: sent, resendId).
     - Update draft.status = sent, draft.sentAt = now.
     - If draft.role === "offer":
         - enrollment.status = completed, completedAt = now.
       else:
         - Compute next draft's scheduledFor = clampToBusinessHours(now + nextRoleGap).
         - ctx.scheduler.runAt(...) for the next draft.
         - Update next draft: status: scheduled, scheduledFor, scheduledFunctionId.
   On failure:
     - Convex action retry (3 attempts, exponential backoff).
     - After final failure: draft.status = failed. UI surfaces.
```

### Pause / Resume / Stop

- **Pause:**
  1. Find the scheduled draft (only one is ever scheduled).
  2. `ctx.scheduler.cancel(scheduledFunctionId)`.
  3. Update draft: `status: "draft"`, clear `scheduledFor` and `scheduledFunctionId`.
  4. Enrollment: `status: "paused"`, `pausedAt: now`, `pausedReason`.
- **Resume:**
  1. Find the next unsent draft (lowest `order` with `status === "draft"`).
  2. Compute `scheduledFor = clampToBusinessHours(now + roleGap[order])`. (For the orientation case at resume, treat as immediate; for any other role, use its gap.)
  3. `ctx.scheduler.runAt(...)` and update draft.
  4. Enrollment: `status: "approved"`.
- **Stop:**
  1. If a draft is scheduled, cancel it.
  2. Enrollment: `status: "stopped"`, `stoppedAt: now`. Terminal.

### Resend webhook handler

Endpoint: `POST /api/email-campaigns/resend-webhook`. Verifies the Resend webhook signing secret. For each event, look up the matching `emailSends` row by `resendId` and:

- `email.delivered` → `sends.status = delivered`
- `email.opened` → `sends.openedAt = event.created_at`, status remains `delivered` unless something later promotes it
- `email.clicked` → `sends.clickedAt`, `sends.clickedUrl`, status `clicked`
- `email.bounced` → status `bounced`, insert into `emailSuppressions` with reason `bounced`, set enrollment `unsubscribed`, cancel any scheduled future draft
- `email.complained` → status `complained`, insert into `emailSuppressions` with reason `complained`, set enrollment `unsubscribed`, cancel any scheduled future draft

### Business-hours clamp

`clampToBusinessHours(timestamp): number`

- If `campaignConfig.businessHoursEnabled === false`: return `timestamp` unchanged.
- Else: convert `timestamp` to Europe/London local time. If it falls inside `[businessHoursStartUtcMinutes..businessHoursEndUtcMinutes)` on a `businessDays` day, return as-is. Otherwise, advance to the next 09:00 on a business day in Europe/London. (Use `Intl.DateTimeFormat` with `timeZone: "Europe/London"` to handle BST/GMT transitions.)

## Unsubscribe & suppression

### Unsubscribe footer (appended to every sequence email)

```html
<hr style="border:none;border-top:1px solid #e2e1dc;margin:24px 0;" />
<p style="color:#7b7b96;font-size:13px;">
  You're getting these because you generated a Signal Score for <a href="${reportUrl}">${reportUrl}</a>.
</p>
<p style="color:#7b7b96;font-size:13px;">
  Don't want to hear from me? <a href="${unsubscribeUrl}">Unsubscribe</a> — one click, no questions asked.
</p>
```

`unsubscribeUrl = ${campaignConfig.unsubscribeBaseUrl}?t=${draft.unsubscribeToken}`.

### `List-Unsubscribe` headers

Every send includes:

```
List-Unsubscribe: <${unsubscribeUrl}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Resend's API supports custom headers via the `headers` field on the send payload.

### `/unsubscribe` page (public, GET)

1. Read `?t=` param.
2. Verify HMAC against `process.env.UNSUBSCRIBE_SIGNING_SECRET`. On invalid token: render generic error page.
3. Decode `{ enrollmentId, draftId }`. Look up enrollment + lead.
4. Insert `emailSuppressions` row with `reason: "unsubscribed"`, `enrollmentId`, lead's email.
5. Update enrollment: `status: "unsubscribed"`. Cancel any scheduled draft.
6. Render confirmation: "You're unsubscribed. You won't hear from us again. [I unsubscribed by accident]".
7. The "by accident" button POSTs back, deletes the suppression row, sets enrollment back to `paused` (not `approved` — Daniel reviews before re-resuming).

### Manual suppression

Admin action on `/dashboard/leads/[id]`: "Suppress this email." Inserts `emailSuppressions` with `reason: "manual"`, optional note. Same effect as unsubscribe.

### Existing report-unlock email is unchanged

The current `sendSignalScoreToVisitor` (the magic-link unlock email) keeps its existing shape and is sent on report completion as today. The orientation sequence email is a *separate* send that goes out after Daniel approves the enrollment. The unlock email does not carry an unsubscribe link (it's transactional and one-off); the orientation email does (it's the start of marketing).

## Admin UI

### `/dashboard/email-campaigns` (overview)

Layout, top to bottom:

1. **Kill switch panel.** Big toggle. Shows current state ("ON since 6 May 2026, 11:14" or "OFF since 4 May 2026, 16:30 — note: \"voice still drifting on offer email\""). When flipping OFF, prompt for a note (saved to `killSwitchNote`). When flipping ON, confirmation modal: "N pending sends will fire on schedule." Banner across the page when OFF.
2. **Stats grid** (last 30 days + all-time toggle):
   - Active sequences (`status = approved` count)
   - Pending approval (`status = pending_approval` count)
   - Emails sent (`emailSends` count)
   - Open rate (% of `emailSends` with `openedAt`)
   - Click rate (% of `emailSends` with `clickedAt`)
   - Replied (manual counter — count of enrollments paused with `pausedReason = "replied"`)
   - Unsubscribed (`emailSuppressions` count with reason `unsubscribed`)
   - Completed sequences (`status = completed` count)
3. **Pending approval queue.** Newest first. Each row: prospect name + email, report URL, signal score, "Stale: N" badge if any drafts stale, verifier flag chips (Voice / Loops / Cheese / Factual) if any, "Review" button → enrollment page.
4. **Active enrollments.** Currently sending. Each row: prospect, current role + draft sent, next scheduled time-until-send, "View" / "Pause" inline buttons.
5. **Recently sent.** Last 20 `emailSends` with status, opens, clicks.

### `/dashboard/email-campaigns/sequence` (sequence + briefs + voice)

Three tabs:

- **Sequence tab.** Name, description, kill switch indicator. Cadence editor: 7 rows (one per role), each row = role label + "wait N days/hours/minutes after previous email" input. Save bumps `emailSequences.updatedAt`.
- **Briefs tab.** Sidebar list of 7 roles. Click a role → editor with fields: purpose, required beats, loops to open, loops to close, tone, length guide, worked example. Version indicator + "Stale drafts in pending/approved enrollments: N" badge with "Mark all stale" button (no-op if already stale, just reaffirms). Save creates a new `emailRoleBriefs` row.
- **Voice tab.** Single big textarea for the voice spec. Version indicator + stale count. Save creates a new `emailVoiceSpec` row.

### `/dashboard/email-campaigns/enrollments/[id]` (per-prospect view)

Top section:

- Prospect: name + email + report URL + signal score. Link back to `/dashboard/leads/[id]` and `/report/[reportId]`.
- Status badge.
- **Big red "Pause — they replied" button** when status is `approved`. One click → enrollment paused with reason `replied`.
- Action row: Approve (when `pending_approval`) | Stop | Pause/Resume | Regenerate stale drafts | Regenerate entire sequence (with confirm).
- Verification flags banner if any. Clicking a flag scrolls to the offending draft.

Below: **drafts timeline** — 7 accordion rows in role order. Each draft row shows:

- Role label (orientation / backstory / wall / etc.) + order number.
- Subject (editable inline).
- Body (rich textarea — saved as html; "View plain text" toggle exposes `bodyText`).
- Schedule indicator:
  - `draft` → "Will be scheduled after previous email sends."
  - `scheduled` → "Sending in 4h 12m (Tue 2 Jun, 14:30)."
  - `sent` → "Sent Tue 2 Jun, 14:31."
  - `skipped_*` → "Skipped: kill switch / suppression / etc."
- Stale badge with "Regenerate just this draft" button.
- "Edited by Daniel" badge with "Regenerate later drafts" button (only shown if downstream drafts haven't been regenerated since this edit).
- For sent drafts: read-only, plus opened-at, clicked-at, clicked-url.
- Loops opened here / closed here (chips listing loop ids + descriptions).
- Report findings cited (chips).

Saving an edit to subject/body persists, sets `editedByDaniel: true` on this draft, sets `isStale: true` on later drafts. Saving the schedule offset (rare — only the next-scheduled draft can have its `scheduledFor` adjusted directly) cancels and re-registers the scheduled function.

### Lead detail page integration

`/dashboard/leads/[id]` gets a new section "Email Campaign" linking to the enrollment if one exists. Shows: status, drafts sent / total, next scheduled time, inline pause/stop buttons.

## Seeding

On first deploy, a one-time migration runs (or a manual seed mutation invoked by Daniel):

1. Insert `campaignConfig` row with `globalKillSwitch: true`, defaults as listed above.
2. Insert `emailSequences` row (Signal Report Soap Opera, default cadence).
3. Insert 7 `emailRoleBriefs` skeleton rows (purpose + required beats + length guide pre-filled; worked examples are short stub messages telling Daniel to fill them in).
4. Insert one `emailVoiceSpec` row with a stub body warning that the voice spec is a stub and the verifier should flag drafts generated against it.

The verifier prompt explicitly checks: "Does the voice spec contain the literal stub marker `<<VOICE SPEC STUB>>`? If so, flag every draft as voice-failed." This is the safety latch.

## Configuration / env

New env vars required:

- `OPENROUTER_API_KEY` — already present (used by insights pipeline). Reused.
- `RESEND_API_KEY` — already present.
- `RESEND_WEBHOOK_SIGNING_SECRET` — new. Used to verify webhook payloads.
- `UNSUBSCRIBE_SIGNING_SECRET` — new. Used to HMAC unsubscribe tokens.
- `NEXT_PUBLIC_SITE_URL` — already present.

Resend dashboard config (manual, one-off):

- Add webhook endpoint: `https://dreamfree.co.uk/api/email-campaigns/resend-webhook`
- Subscribe to events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
- Capture the signing secret into `RESEND_WEBHOOK_SIGNING_SECRET`

## Testing strategy

Convex actions (generation pipeline, send pipeline) are tested with the Convex test harness, mocking the OpenRouter and Resend HTTP calls. Specific test cases:

- Generation: trigger creates an enrollment, all 7 drafts generated in order, verification pass populated, status → `pending_approval`. Loop ledger correctly accumulates open loops and marks closed ones.
- Generation failure: LLM returns invalid JSON 3 times → status `generation_failed`.
- Approval: schedules orientation only, not drafts 2–7.
- Send: kill switch ON reschedules; kill switch OFF sends; suppressed email skips and marks enrollment unsubscribed; terminal status skips.
- Send chains: after orientation sends, backstory is scheduled. After offer sends, enrollment → `completed`.
- Edit cascade: editing draft 3 marks 4–7 stale; regenerating runs only 4–7; verification re-runs.
- Voice/brief edits: existing pending drafts flagged stale; sent drafts unchanged.
- Webhook: bounced event suppresses + cancels future scheduled draft; clicked event records click.
- Unsubscribe: valid token suppresses + unsubscribes enrollment; invalid token shows error; "by accident" path restores.
- Business-hours clamp: GMT and BST cases; weekends and out-of-hours bumps.
- Re-trigger guard: lead with active enrollment doesn't get a second one.

Frontend pages tested manually for v1 — small enough surface that automated coverage isn't worth it yet.

## Cost / scale notes

- Generation: ~8 LLM calls per sequence (7 drafts + 1 verifier). At Gemini 2.5 Flash via OpenRouter, ~$0.05/sequence. Edit-regen averages another ~$0.02. Negligible.
- Resend usage: ~7 sends per completed sequence. Within current Resend plan limits.
- Convex scheduled functions: durable, no concerns at this scale.

## Out of scope (deferred — re-flagged)

- Variants by score band
- Resend inbound webhook for auto-pause on reply
- `mailto:` form of `List-Unsubscribe`
- A/B testing of subject lines
- Cohort analytics / attribution
- Welcome sequence on conversion
- Multilingual support
