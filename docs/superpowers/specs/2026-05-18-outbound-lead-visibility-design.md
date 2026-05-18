# Outbound lead visibility — design

**Date:** 2026-05-18
**Status:** Draft (pending review)

## Problem

The admin dashboard and the Mission Control activity API treat every lead the
same. Since the signal-report-api ships, every prospect we POST a report for
becomes a row in `leads` with `leadType: "outbound"` and `sources: ["api_outbound"]`.
These rows are valid records — but they are not engaged. Mixing them into the
dashboard's headline numbers and into Mission Control's daily briefing creates
noise that drowns out actual inbound activity (newsletter, contact form,
signal-score on the public site).

When the recipient of an outbound API report **does** click through and view
their report, that is exactly the engagement signal Daniel wants surfaced.

## Goals

1. The admin dashboard's top-level view shows inbound + engaged-outbound leads
   only. Unengaged API leads are reachable but never in the main feed.
2. The Mission Control API drops unengaged outbound rows from `leads` and
   API-created reports with no view from `signalReports`. Engagement events
   keep surfacing.
3. Every API lead remains auditable — nothing is deleted, only filtered out of
   the main views.
4. The work ships the engagement tracking that was deferred from Plan 2 of
   [`2026-05-12-signal-report-api-design.md`](./2026-05-12-signal-report-api-design.md).

## Non-goals

- Promoting `outbound → inbound` on report view. Viewing is engagement, not
  consent — the existing form-submission-only promotion stays.
- Changing email-campaign enrolment. `convex/emailCampaigns.ts:589` already
  skips non-inbound leads correctly.
- Backfilling historical rows. New fields are optional; undefined means
  not-engaged / zero views.
- Detecting unique vs. repeat viewers, bot filtering, or anything else beyond
  "valid token → recorded".

## The signal: engagement tracking (executes Plan 2 of the May 12 spec)

### Schema additions

```ts
signalReports: {
  // existing fields …
  firstViewedAt: v.optional(v.number()),   // epoch millis; first valid-token load
  viewCount:     v.optional(v.number()),   // increments on every valid-token load
}

leads: {
  // existing fields …
  firstEngagedAt:  v.optional(v.number()), // mirrors firstViewedAt of first viewed report
  lastEngagedAt:   v.optional(v.number()), // updated every view
  engagementCount: v.optional(v.number()), // total views across the lead's reports
}
```

All fields are optional; treat `undefined` as `0` / not-engaged. No backfill.

### `signalReports.recordEngagement` mutation

Called when a report URL is loaded with a matching `verifyToken`. Body:

1. Look up the report. If `createdViaApiKeyId` is unset, return — engagement
   tracking is API-leads-only. (Inbound report views already produce normal
   `events` rows.)
2. On the report: stamp `firstViewedAt = now` if unset; `viewCount = (viewCount ?? 0) + 1`.
3. On the linked lead: stamp `firstEngagedAt = now` if unset; set
   `lastEngagedAt = now`; `engagementCount = (engagementCount ?? 0) + 1`.
4. Insert an `events` row: `type: "outbound_report_viewed"`, `leadId`, `path:
   "/report/<id>"`, `properties: { reportId, viewCount }`, `timestamp: now`,
   `anonymousId: ""` (no anonymous id at this point — the visitor identifies
   via the report token, not the analytics cookie).

The mutation is idempotent-ish — re-fires on every load by design (so view
counts reflect actual loads). Multi-tab noise is accepted (per the May 12 spec).

### Where the hook fires

`/api/report/[id]/verify?token=…` is the existing route that converts a
report-URL token into a verification cookie. After the token check passes,
call `signalReports.recordEngagement` once. The route already validates the
token, so we get authentication for free and don't fire on missing/mismatched
tokens. The `/report/[id]` page itself does not fire the mutation — only the
verify route does — so a bookmark of `/report/[id]` (no token) after the
cookie is set won't re-increment counts.

## Filter rules (used everywhere)

Two rules define "visible at the top level":

```ts
// A lead is top-level visible:
const leadVisible = lead.leadType !== "outbound" || lead.firstEngagedAt != null;

// An API-created report is top-level visible:
const reportVisible = report.createdViaApiKeyId == null
                   || report.firstViewedAt != null;
```

Both rules are cheap (single field reads, no joins). They are the only logic
the dashboard and Mission Control need to apply.

## Admin dashboard

### `/dashboard` (existing page)

**Top stat cards** — labels unchanged, counts now reflect only visible leads:

- `Total Leads` — count of leads where `leadVisible` is true.
- `This Week` — same, filtered to `createdAt > now − 7d`.
- `Contact Enquiries` — unchanged in practice (contact-form leads are
  inbound), but uses the same visibility filter for consistency.

**Leads table** — `api.leads.list` gets a `visibility: "topLevel" | "all"`
arg, defaulting to `"topLevel"`. Engaged-outbound rows appear in the same
table; their Sources column gets an additional `"Outbound — Viewed ×N"` chip
(distinctive colour) so they are visually distinguishable from inbound
without separating them.

**Recent Activity** — `api.events.recentActivity` unchanged. The
`outbound_report_viewed` event gets a label `"Opened their report"` in
`EVENT_LABELS` and slightly more prominent styling (e.g. teal accent border)
so click-throughs catch the eye. This is the "surface the click-through" half
of the requirement.

### `/dashboard/api-leads` (new page)

The catch-all view for everything filtered out of the main dashboard.

- Sidebar entry: `API leads (N)` where `N` = count of all
  `leadType === "outbound"` leads.
- Filter strip at the top: `All` (default) / `Engaged` / `Not yet viewed`.
- Table columns: Email · API key name (which key created their report) · URL
  audited · Score · Views · First viewed · Created.
- Sort: `firstEngagedAt desc nulls last, createdAt desc`. Engaged leads
  surface first; within each group, newest first.
- Email cell links to the existing `/dashboard/leads/[id]` (which already
  renders correctly for outbound leads).
- Status pill: `Not viewed` (grey) / `Viewed ×N` (teal).

Data comes from a new `leads.listOutbound` query that joins each lead's
most-recent API report (for URL, score, viewCount, firstViewedAt) and the
report's `createdViaApiKeyId` → api key name. Limit 200; no pagination yet
(volume is small).

### Sidebar / nav

Add the `API leads (N)` entry just below `Leads`. Count comes from a small
`leads.countOutbound` query; reactive (so it ticks down when a lead engages
and moves into the main feed). If multiple sidebars exist (e.g. dashboard
layout component), update only the dashboard one.

## Mission Control API (`/api/mission-control/activity`)

`convex/missionControl.ts → getActivity` applies the two filter rules before
returning:

```ts
const visibleLeads   = leads.filter(leadVisible);
const visibleReports = signalReports.filter(reportVisible);
```

Behaviour by field:

- `leads` — filtered. Unengaged outbound leads are dropped.
- `signalReports` — filtered. API reports with no view are dropped.
- `events`, `formSubmissions`, `emailSends`, `emailEnrollments`,
  `contentPlans`, `callbackRequests`, `demoRequests`, `tags`, `leadTags` —
  unchanged. `outbound_report_viewed` events keep flowing through `events`.
- `leadsReferenced` — built from leadIds referenced by the **filtered**
  arrays (so an unengaged outbound lead is not resolved; an engaged outbound
  lead and any lead referenced by other visible activity is). This avoids
  leaking dropped leads via the join map.
- `counts` — totals match the filtered arrays exactly (so consumers can't
  detect a discrepancy between `counts.leads` and `leads.length`).

Window logic, auth, and the `lastCalledAt` cursor are unchanged.

### Documentation

`docs/mission-control-api.md` gets a new short subsection titled
**"Outbound leads & API-created reports"** explaining:

- Outbound (API-generated) leads are excluded until they engage with their
  report.
- API-created `signalReports` are excluded until `firstViewedAt` is set.
- The `outbound_report_viewed` event in `events` is the engagement signal —
  when it appears, the matching lead and report appear in the next window.
- This is a behaviour tightening within v1, not a breaking schema change.

## Files touched

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `firstViewedAt`, `viewCount` to `signalReports`; `firstEngagedAt`, `lastEngagedAt`, `engagementCount` to `leads`. |
| `convex/signalReports.ts` | Add `recordEngagement` internal mutation + public wrapper. Update getters to expose new fields. |
| `convex/leads.ts` | `list` gains a `visibility` arg with the filter rule. Add `listOutbound` query. Add `countOutbound` query. |
| `convex/missionControl.ts` | Apply both filter rules in `getActivity`; rebuild `leadsReferenced` from filtered arrays; adjust `counts`. |
| `app/api/report/[id]/verify/route.ts` | Call `signalReports.recordEngagement` after token validation succeeds. |
| `app/dashboard/page.tsx` | Use `visibility: "topLevel"` on `leads.list`; add the `Outbound — Viewed ×N` chip; add the `outbound_report_viewed` label/styling. |
| `app/dashboard/api-leads/page.tsx` | New page — filtered list of all outbound leads. |
| `components/dashboard/Sidebar.tsx` (or equivalent) | New `API leads (N)` entry; uses `countOutbound`. |
| `docs/mission-control-api.md` | New "Outbound leads & API-created reports" subsection. |

## Testing

- `convex/signalReports.test.ts` — `recordEngagement`: first view stamps
  `firstViewedAt` + `firstEngagedAt`, repeat view only increments counters,
  no-op when `createdViaApiKeyId` is unset.
- New test for `leads.list` with `visibility: "topLevel"` — excludes
  unengaged outbound, includes engaged outbound and all inbound.
- New test for `missionControl.getActivity` — feed an inbound lead, an
  unengaged outbound lead, and an engaged outbound lead with reports; assert
  the filtered arrays, counts, and `leadsReferenced` match expectations.
- Manual smoke: real `npm run dev`, generate an outbound report via the API,
  confirm the lead is invisible on the dashboard; click the `viewUrl` in a
  private window; confirm the lead now appears with the `Outbound — Viewed
  ×1` chip and the `outbound_report_viewed` event shows in Recent Activity.
  Then check Mission Control over the matching window.

## Open questions

None — all clarifying questions answered before writing this spec.

## See also

- [`2026-05-12-signal-report-api-design.md`](./2026-05-12-signal-report-api-design.md)
  — the originating spec where engagement tracking was deferred to Plan 2.
- [`../../mission-control-api.md`](../../mission-control-api.md)
  — current Mission Control v1 documentation.
