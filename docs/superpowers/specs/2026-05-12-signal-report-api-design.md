# Signal Report API — Design Spec

**Date:** 2026-05-12
**Status:** Draft, pending Daniel review

## Goal

Expose Signal Report generation as an authenticated HTTP API so Daniel can trigger reports from external outreach tooling, get back both a structured JSON payload and a shareable link to the unrestricted report viewer, and treat the resulting prospect records as outbound leads (no consent, no auto-enrollment) until they engage on their own.

When a recipient clicks the report link, the system records the engagement as a strong interest signal — surfaced in Mission Control and the lead's dashboard view — and primes the site for a personalised experience by prefilling forms across the marketing site for that visitor. Engagement is logged but does not constitute consent; only an explicit form submission promotes the lead to inbound and stamps a consent timestamp.

## Non-goals (deferred)

- Per-key rate limits, quotas, or billing.
- Webhook callbacks from the API to the caller when a report finishes (caller polls).
- A managed `campaigns` table with rollups. The API treats every report as standalone; campaign grouping happens externally in Daniel's outreach tool.
- Exposing report editing, retry, or deletion via API.
- Auto-promotion of a lead from outbound to inbound on link click. Promotion requires an actual form submission.
- Personalised hero copy, dynamic landing pages, or A/B variants — the cookie set on link click only prefills forms in v1.
- Automatic email sequence enrollment for outbound leads. Daniel can still manually enroll an outbound lead from the dashboard, but the system will never do it unattended.

## Decisions log

The following choices were made during brainstorming and bind the design:

1. **Reuse the existing report pipeline.** API-created reports go through the same `signalReports` table, the same generation action, and render in the existing `/report/[id]` viewer. The API is a new entry point, not a parallel system.
2. **Outbound vs inbound is a permanent attribute on the lead, mutable in one direction only.** Default for API-created leads is `"outbound"`. First time that email submits any form on the site, `leadType` flips to `"inbound"` and `consentedAt` is stamped. There is no path back to `"outbound"`.
3. **Reports created via API auto-unlock for the prospect.** `accessLevel` is set to `"verified"` at creation time and the `viewUrl` carries the existing per-report `verifyToken`. No email-gate paywall on the report page.
4. **Single per-report token does identification.** The existing `verifyToken` (256-bit random, generated per report) doubles as the visitor identifier. Hitting `/report/<reportId>?t=<token>` (a) renders the unrestricted report, (b) records the engagement, (c) sets a signed cookie identifying the lead for prefill across the site. No separate engagement token is added; no leadId, email, name, or other identifier ever appears in the URL or querystring.
5. **Click is engagement, not consent.** Validating the token never changes `leadType` or stamps `consentedAt`. Only a form submission does.
6. **Polling, not webhooks, for async completion.** The POST returns immediately with a `pollUrl`. An optional `wait=true` query enables a single ~25-second long-poll for callers who want a one-shot result. Webhooks are deferred.
7. **No campaign field.** Reports and leads do not carry a campaign identifier. Daniel groups them externally.
8. **No per-key rate limit.** A valid bearer token grants unlimited generation. Revocation is the only throttle.
9. **One admin page for keys, with reveal-once.** `createKey` already returns the raw key once; the new admin page surfaces this with a copy-to-clipboard reveal modal and a list/revoke table.

## Architecture overview

Three layers, all additive — no existing function changes its signature.

### Auth layer
A small `lib/api-auth.ts` helper. Reads the `Authorization: Bearer <key>` header, hashes the raw key with SHA-256, calls the existing `apiKeys.verifyAndTouch` mutation, and returns either the validated `{ keyId, name }` or a 401. Used by both API endpoints.

### Report endpoints (Next.js route handlers)
Two routes under `app/api/v1/signal-reports/`:

- `POST /api/v1/signal-reports` — create a report. Validates the bearer key. Upserts the lead via a new mutation `leads.upsertOutboundLead` (which sets `leadType: "outbound"` on first creation; on a re-call for an email that already exists as inbound, leaves `leadType` alone). Performs the same fetch + HTML strip as the public `/api/signal-score` route. Calls a new mutation `signalReports.enqueueReportFromApi` which mirrors the existing `enqueueReport` but additionally stamps `accessLevel: "verified"`, sets `viewCount: 0`, and records `createdViaApiKeyId`. The 256-bit `verifyToken` is generated as it is today and embedded in the returned `viewUrl`. Returns `{ reportId, status, viewUrl, pollUrl }`. If `wait=true`, the handler polls the report status internally for up to 25 seconds before returning the same shape, with `report` populated when complete.
- `GET /api/v1/signal-reports/{id}` — fetch status + full JSON. Validates the bearer key. Returns `{ reportId, status, viewUrl }` while `pending`, `{ reportId, status, viewUrl, report }` on `success`, and `{ reportId, status, viewUrl, error: "..." }` on terminal failures (`fetch_failed`, `llm_failed`).

Same `signalReportsAction.runReportGeneration` action runs in the background regardless of entry point.

### Engagement layer
The existing report viewer page (`app/report/[id]/page.tsx`) gains a server-side hook that runs whenever the URL carries a valid `t` token (which API-created reports always include in their `viewUrl`):

1. Look up the report by id, confirm the `t` query matches the row's `verifyToken` (existing behaviour — no new comparison logic).
2. Resolve the lead via the report's `leadId`. Skip the rest if the report was not created via API (`createdViaApiKeyId` is unset) — public-form reports already use their own flow.
3. Call a new mutation `signalReports.recordEngagement` which:
   - Stamps `firstViewedAt` if unset, increments `viewCount`.
   - On the lead, stamps `firstEngagedAt` if unset, sets `lastEngagedAt = now`, increments `engagementCount`.
   - Inserts an `events` row of type `outbound_report_viewed` with properties `{ reportId, viewCount, referrer?, userAgent? }` so it shows up in Mission Control via the existing activity query.
4. Set a signed HTTP-only cookie `df_lead` containing only `{ leadId }`, signed with `LEAD_IDENTITY_SIGNING_SECRET` (HMAC-SHA256), 30-day TTL, `SameSite=Lax`, `Secure`.

A new client hook `useLeadIdentity()` in `lib/lead-identity.ts` does **not** read the cookie directly. Instead it calls a thin server action `getLeadIdentity()` that:
- Reads and verifies the signed cookie.
- Looks up the lead by id.
- Returns only `{ firstName, email, phone }` — never `leadId`, never anything not needed by a prefill form.

This means the leadId never reaches the browser's JS context, the cookie is `HttpOnly` (so JS can't read it anyway), and the resolved values are only the data the prospect already knows about themselves.

On form submit, the existing `upsertLead` flow detects that the email matches an outbound lead and flips `leadType` to `"inbound"` with `consentedAt = now`. The `/unsubscribe` route clears the cookie.

## Data model changes

### `leads` table — additions
```ts
leadType: v.union(v.literal("inbound"), v.literal("outbound")),
consentedAt: v.optional(v.number()),
firstEngagedAt: v.optional(v.number()),
lastEngagedAt: v.optional(v.number()),
engagementCount: v.optional(v.number()),
```

A one-shot internal mutation `migrations.backfillLeadType` sets every existing lead to `leadType: "inbound"` and `consentedAt = createdAt`. Run once at deploy, then the migration code is removed.

### `signalReports` table — additions
```ts
firstViewedAt: v.optional(v.number()),
viewCount: v.optional(v.number()),
createdViaApiKeyId: v.optional(v.id("apiKeys")),
```

All optional — existing rows continue to work without backfill. `viewCount` is treated as `0` when undefined in queries and renderers. The existing `verifyToken` field doubles as the visitor-identifying token; no new token field is added.

### `events` — no schema change
New event type string `outbound_report_viewed` added to the conventions used by Mission Control. The `events` table already accepts arbitrary `type` strings, so this is just a new value plus a renderer.

### `apiKeys` — no schema change
The existing table is sufficient. Optional future addition: a `webhookUrl` column when webhooks ship.

## API contract

### `POST /api/v1/signal-reports`

Headers: `Authorization: Bearer <raw-key>`, `Content-Type: application/json`.

Request body:
```jsonc
{
  "url": "https://example.com",            // required — site to analyse
  "customerDescription": "homeowners …",   // required — feeds the LLM
  "firstName": "Jane",                     // required — for the lead record
  "email": "jane@example.com",             // required — keys the lead record
  "phone": "+44…",                         // optional
  "wait": false                            // optional — long-poll up to 25s
}
```

Response 200 (async, default):
```jsonc
{
  "reportId": "j97abc…",
  "status": "pending",
  "viewUrl": "https://dreamfree.co.uk/report/j97abc…?t=<verifyToken>",
  "pollUrl": "https://dreamfree.co.uk/api/v1/signal-reports/j97abc…"
}
```

Response 200 (when `wait=true` and generation completes in time):
```jsonc
{
  "reportId": "...",
  "status": "success",
  "viewUrl": "...",
  "pollUrl": "...",
  "report": { /* full payload — see GET response */ }
}
```

Response 401 — invalid or revoked key.
Response 400 — missing required fields, with `{ "error": "missing_fields", "fields": [...] }`.
Response 502 — site fetch failed (caller may want to know immediately rather than poll a `fetch_failed` row). Body: `{ "error": "fetch_failed", "reportId": "...", "viewUrl": "..." }`. The report row is still saved with `status: "fetch_failed"` for dashboard visibility.

### `GET /api/v1/signal-reports/{id}`

Headers: `Authorization: Bearer <raw-key>`.

Response 200 while pending:
```jsonc
{ "reportId": "...", "status": "pending", "viewUrl": "..." }
```

Response 200 on success:
```jsonc
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
      "character":      { "score": 7, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "problem":        { "score": 5, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "guide":          { /* … */ },
      "plan":           { /* … */ },
      "cta":            { /* … */ },
      "stakes":         { /* … */ },
      "transformation": { /* … */ }
    },
    "quickWin": "...",
    "strengths": ["...", "..."],
    "fullSummary": "..."
  }
}
```

Response 200 on terminal failure: `{ "reportId": "...", "status": "fetch_failed" | "llm_failed", "viewUrl": "..." }`.

Response 401 — invalid key.
Response 404 — unknown report id.

## Engagement and identity flow

```
External outreach tool
        │
        │  POST /api/v1/signal-reports
        ▼
  Auth check ──► Upsert outbound lead ──► Fetch + strip site ──► enqueueReportFromApi
                                                                        │
                                              schedules signalReportsAction.runReportGeneration
                                                                        │
                                                            patches report → status: success
        ▲
        │  GET /api/v1/signal-reports/{id}  (caller polls)
        │
        └──► returns full JSON when status === "success"


External tool emails the prospect with viewUrl
        │
        ▼
Prospect clicks → /report/{id}?t=<verifyToken>
        │
        ▼
  Page server-side:
    • validate t → render full report (already supported)
    • if report.createdViaApiKeyId is set → recordEngagement mutation:
        - report: firstViewedAt, viewCount++
        - lead:   firstEngagedAt, lastEngagedAt, engagementCount++
        - events: insert "outbound_report_viewed"
    • set HttpOnly signed cookie df_lead = { leadId } (signed, not encrypted)


Prospect later visits any other page on the site
        │
        ▼
  useLeadIdentity() → server action getLeadIdentity()
    • reads HttpOnly cookie, verifies signature
    • looks up lead by id, returns { firstName, email, phone? } only
    • leadId never crosses the network back to the browser
  → forms prefill firstName/email/phone


Prospect submits any form
        │
        ▼
  upsertLead path detects matching outbound lead:
    leadType: "outbound" → "inbound"
    consentedAt = now
    sources.push(formSource)
```

## Mission Control surfacing

`missionControl.getActivity` already returns the `events` table for the time window. No query change required. The Mission Control client gets a small renderer for the new event type:

> 🔥 **Outbound report viewed** — Jane (jane@example.com) opened her report for `example.com` (view #2, 12 min ago)

The reports list in the dashboard joins each row to its lead and labels the source as `api` (when `createdViaApiKeyId` is set) or `form` (when not). The leads list grows a `Type` badge column (`inbound` / `outbound`) and a filter chip. The lead detail page shows a small "Engagement" panel with `firstEngagedAt`, `lastEngagedAt`, `engagementCount`, and a list of report views.

A new dashboard widget — "Hot outbound prospects" — lists outbound leads where `lastEngagedAt` falls in the last 7 days, ordered by `engagementCount` desc, capped at 10.

## Admin UI: API keys

New page at `app/dashboard/admin/api-keys/`:

- Table columns: name, created, last called (relative), reports created (count via `signalReports` query indexed on `createdViaApiKeyId`), prospects engaged (distinct leads with engagement on those reports), status (active / revoked), revoke button.
- "Create key" button opens a modal that calls the existing `apiKeys.createKey` action and renders the returned raw key once with a copy-to-clipboard control and a "Saved it" dismiss. Closing the modal without dismissing logs a console warning but does not block.
- Revoke is a confirmation dialog calling `apiKeys.revokeKey`. Revoked keys remain in the list (greyed out) so historical attribution survives.

This page lives under the existing admin layout and inherits its access guard.

## Files to add or change

### New files
- `app/api/v1/signal-reports/route.ts` — POST handler.
- `app/api/v1/signal-reports/[id]/route.ts` — GET handler.
- `app/dashboard/admin/api-keys/page.tsx` — keys page.
- `app/dashboard/admin/api-keys/CreateKeyModal.tsx` — reveal-once modal.
- `lib/api-auth.ts` — bearer auth helper.
- `lib/lead-identity.ts` — cookie read/write + `useLeadIdentity` hook.
- `lib/lead-identity-server.ts` — server-side cookie sign/verify (separate file to avoid `next/headers` in client bundle).
- `convex/migrations.ts` — one-shot `backfillLeadType` internal mutation.
- `docs/api.md` — public-facing reference (request/response examples, auth, polling, view link semantics, GDPR posture).

### Modified files
- `convex/schema.ts` — `leads` and `signalReports` field additions.
- `convex/leads.ts` — `upsertOutboundLead` mutation; `upsertLead` flips `leadType` and stamps `consentedAt` on outbound→inbound.
- `convex/signalReports.ts` — `enqueueReportFromApi` mutation, `recordEngagement` mutation, `getApiResponse` query (returns the JSON shape the GET endpoint serialises), `listByApiKey` query for admin attribution.
- `convex/apiKeys.ts` — `getReportCount` query for the admin table.
- `app/report/[id]/page.tsx` — for reports with `createdViaApiKeyId` set, fire `recordEngagement` and set the `df_lead` cookie.
- `app/dashboard/leads/page.tsx` — `Type` column + filter.
- `app/dashboard/leads/[id]/page.tsx` — engagement panel.
- `app/dashboard/page.tsx` (or current dashboard root) — "Hot outbound prospects" widget.
- `app/dashboard/admin/layout.tsx` — nav entry for API keys.
- Form components that take name/email/phone — wire `useLeadIdentity()` for prefill. Concrete files identified during implementation; expected: `app/api/signal-score/page.tsx`, `app/contact/page.tsx`, `app/free-demo/*`, `app/free-tools/*`.
- `.env.example` and Convex env var docs — `LEAD_IDENTITY_SIGNING_SECRET`.

### Removed
None.

## Errors and edge cases

- **Bearer key missing or malformed:** 401 with `{ "error": "unauthorized" }`. No timing-side-channel — verification always runs.
- **Bearer key valid but revoked:** 401 with the same shape. `verifyAndTouch` already returns `null` for revoked keys.
- **Same email called twice via API:** second call upserts, leaves `leadType` alone (so an already-inbound email stays inbound), creates a fresh report row. Verify tokens are per-report, not per-lead — every report has its own.
- **Inbound lead also targeted via API:** allowed. Their `leadType` stays `"inbound"`. The new report still tracks views and sets the cookie on click; the engagement just isn't a status change for them.
- **`wait=true` but generation exceeds 25s:** returns the async-shape response with `status: "pending"`. Caller falls back to polling. Internal poll interval: 1s; first poll after 5s.
- **`t` token missing or mismatched on the report URL:** existing behaviour — viewer falls back to the email-gate paywall. `recordEngagement` is not fired and no cookie is set. (For API-created reports this should never happen because we always include the token in `viewUrl`; if a recipient hand-edits it off, they get the public view.)
- **Engagement fires but report not yet in `success` status:** record the engagement anyway (it's a valid click against a real report). Cookie is still set. The viewer page already handles the pending state gracefully.
- **Cookie tampering:** signature mismatch → cookie ignored, prefill disabled, no error shown.
- **Site fetch fails:** report saved with `status: "fetch_failed"`, POST returns 502 with `{ error, reportId, viewUrl }`. The viewUrl still works but the page shows a "we couldn't read your site" state (existing behaviour).
- **LLM fails:** report saved with `status: "llm_failed"`, GET returns the failure status. No automatic retry from the API surface — Daniel can re-run from the dashboard.
- **Long-poll connection dropped:** caller is expected to poll. The background generation continues regardless.
- **Multi-tab views:** every load fires `recordEngagement`. We accept the noise; `viewCount` reflects actual page loads with a valid `t` token.

## Testing

Each piece is tested independently; integration is verified manually at the end.

- `lib/api-auth.ts` — unit tests for missing header, malformed header, valid hash, revoked key, hash collision (degenerate case).
- `lib/lead-identity-server.ts` — unit tests for sign/verify round-trip, tampered cookie rejection, missing secret. (`lib/lead-identity.ts` is the thin client wrapper and is exercised by form-component integration tests.)
- `convex/leads.ts` `upsertOutboundLead` — Convex test for new lead, existing inbound lead (no `leadType` change), existing outbound lead (no change).
- `convex/leads.ts` `upsertLead` (modified) — test that an outbound lead flipped to inbound on form submit, and that an already-inbound lead is not re-stamped.
- `convex/signalReports.ts` `recordEngagement` — test first view (stamps firstViewedAt + firstEngagedAt), repeated view (only increments counters), and that it is a no-op when called for a report with no `createdViaApiKeyId`.
- `app/api/v1/signal-reports/route.ts` POST — integration test with mocked Convex: 401 on bad key, 200 on valid request, 502 on fetch failure, `wait=true` returns sync result when fast.
- `app/api/v1/signal-reports/[id]/route.ts` GET — integration test for pending / success / failure / 404 / 401.
- Manual smoke test: real `npm run dev`, mint a key from the new admin page, curl the POST, click the returned `viewUrl` in a private browser window, confirm the engagement event lands in Mission Control and the cookie prefills the contact form.

## Security and privacy posture

### What goes in the URL
Only two values: the Convex `reportId` (random opaque ID, not enumerable) and the per-report `verifyToken` (256 bits of `crypto.randomBytes`, base64url-encoded). No leadId, no email, no firstName, no phone, no campaign reference, no sequential counter. Nothing in the URL identifies the prospect to anyone who didn't already have the URL.

### What goes in the cookie
A signed (not encrypted) value containing exactly one field: `{ leadId }`. Signature is HMAC-SHA256 with `LEAD_IDENTITY_SIGNING_SECRET` (≥32 random bytes, Convex env var). Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day TTL. The browser-side JS bundle never sees the cookie or the leadId — prefill values come back from a server action that does the lookup.

### What goes in the API responses
The POST and GET responses include `viewUrl` (the same shareable link), `reportId`, `status`, and (on success) the full report JSON. They do not include the `verifyToken` as a separate field — it's only embedded in `viewUrl` and never logged outside Convex. They do not include the recipient's `leadId` (the caller already knows the email they passed in).

### Threat model

| Threat | Mitigation |
|--------|-----------|
| URL leaked via referrer header, email forward, shared screenshot | Token is per-report. Worst case: third party can read the report contents (which contain only the prospect's site URL, the customer description Daniel supplied, and the AI analysis — no PII beyond firstName/email of the prospect, who already knows their own name). They cannot enumerate other reports or leads. |
| Attacker tries to enumerate report IDs | Convex IDs are random and not sequential. Even with a valid id, the `verifyToken` is required to render content (existing behaviour). 256 bits of entropy makes the token unguessable. |
| Attacker tries to guess a token | 256 bits. Not guessable. |
| Cookie theft via XSS | `HttpOnly` prevents JS access. CSP and existing input handling apply. |
| Cookie theft via network | `Secure` flag restricts to HTTPS. |
| Cookie forgery | HMAC signature; forgery requires the signing secret. |
| Cookie value tampering | Same as above. |
| Cookie used cross-site for CSRF | `SameSite=Lax`. The cookie only enables prefill, not authenticated state-changing actions. Forms still post their values explicitly — the cookie is hint, not authority. |
| API key leak from caller's machine | Daniel can revoke and re-mint. No automatic rotation in v1; consider for future. |
| Brute-force key guessing | 256-bit keys. Not feasible. No timing channel because `verifyAndTouch` always runs a constant-time-ish lookup. |
| Replay of a stale cookie after the prospect changed their email | Server-side lookup resolves the current lead by id. If the email on the lead has changed, the prefill is whatever the current lead has — no spoofing risk because the cookie never contained the email. |
| Same machine, multiple cold-email recipients | Last-clicked link wins (cookie overwrites). Acceptable for shared-device edge case; the lead is still tracked correctly server-side. |

### Other privacy posture
- Engagement events are first-party analytics. Document them in the privacy policy alongside the existing `events` table usage.
- Outbound leads are explicitly out of scope for any automated marketing email. The existing email-campaigns enrollment paths (Plan 2) gain a guard that rejects enrollment when `leadType === "outbound"` unless an explicit `forceManualOverride: true` flag is passed by the dashboard UI. The dashboard UI surfaces this as a confirm-twice button labelled "Manually enroll outbound lead — confirm consent obtained externally".
- The `/unsubscribe` route already nukes a lead's enrollments and adds a suppression entry. It is extended to also clear the `df_lead` cookie for the requesting browser.

## Open questions

None blocking. The following can be revisited after v1 ships and the API has real usage:

- Webhook callbacks (would replace polling for tools that prefer push).
- Per-key webhook URL on the `apiKeys` row.
- Bulk endpoint (`POST /api/v1/signal-reports/batch`) for multi-prospect outreach blasts.
- Surface `viewCount` and engagement timestamps directly on reports without joining via lead.
