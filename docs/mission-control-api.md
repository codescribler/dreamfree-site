# Mission Control Activity API

A single authenticated endpoint that returns every record created in the
Dreamfree backend over a time window. Designed to feed a daily briefing /
"mission control" report so the consumer can summarise new leads, reports,
demo requests, and engagement.

## Endpoint

```
GET https://dreamfree.co.uk/api/mission-control/activity
```

## Authentication

Every request must include a Dreamfree API key in one of two headers:

```
Authorization: Bearer <KEY>
```

or

```
x-api-key: <KEY>
```

Keys are issued via the Convex `apiKeys:createKey` action and are revocable
through `apiKeys:revokeKey`. The raw key is only shown once at creation time;
the server stores SHA-256 hashes only.

A request without a key returns `401 { "error": "Missing API key. ..." }`.
A revoked or unknown key returns `401 { "error": "Invalid or revoked API key." }`.

## Query parameters (all optional)

| Param   | Format                              | Default                                            |
|---------|-------------------------------------|----------------------------------------------------|
| `since` | ISO-8601 string OR epoch millis     | The previous successful call's timestamp (or `0`) |
| `until` | ISO-8601 string OR epoch millis     | Server time when the request is processed         |

The window is **half-open**: `[since, until)`. Records with
`_creationTime >= since` and `_creationTime < until` are included.

If `since > until` the endpoint returns `400`.

### "Since I last asked" behaviour

If `since` is omitted, the server uses the `lastCalledAt` value it stamped on
the API key during its **previous** successful call. Each successful call
updates `lastCalledAt` to the moment the request was authenticated, so the
sequence:

1. Call with no `since` → returns everything from time `0` to now (`T1`).
2. Some hours later, call with no `since` → returns everything from `T1` to now.
3. Repeat indefinitely.

Pass `since` explicitly when you need to query an arbitrary window or backfill.

## Response

`200 OK`, `Content-Type: application/json`. Top-level shape:

```json
{
  "key": { "name": "daily mission control" },
  "windowStart": 1714521600000,
  "windowEnd":   1714608000000,
  "counts": {
    "leads": 12,
    "events": 480,
    "formSubmissions": 6,
    "signalReports": 4,
    "contentPlans": 1,
    "callbackRequests": 0,
    "demoRequests": 2,
    "emailEnrollments": 0,
    "emailSends": 5,
    "tags": 0,
    "leadTags": 0
  },
  "leads":            [ ...Doc<"leads">            ],
  "events":           [ ...Doc<"events">           ],
  "formSubmissions":  [ ...Doc<"formSubmissions">  ],
  "signalReports":    [ ...Doc<"signalReports">    ],
  "contentPlans":     [ ...Doc<"contentPlans">     ],
  "callbackRequests": [ ...Doc<"callbackRequests"> ],
  "demoRequests":     [ ...Doc<"demoRequests">     ],
  "emailEnrollments": [ ...Doc<"emailEnrollments"> ],
  "emailSends":       [ ...Doc<"emailSends">       ],
  "tags":             [ ...Doc<"tags">             ],
  "leadTags":         [ ...Doc<"leadTags">         ],
  "leadsReferenced":  { "<leadId>": Doc<"leads">, ... }
}
```

`windowStart` and `windowEnd` are epoch millis (UTC).

`leadsReferenced` is the join table: every `leadId` appearing in any of the
returned arrays (and every lead returned in `leads`) is keyed here so the
consumer can resolve names, emails, scores, and source attribution without
issuing a second request.

### Per-table field reference

All Convex documents include `_id` and `_creationTime` (epoch millis).
Domain fields below.

#### `leads`

Master record of a person who has interacted with the site.

| Field          | Type     | Notes |
|----------------|----------|-------|
| `email`        | string   | Lowercased, deduped |
| `firstName`    | string?  | |
| `name`         | string?  | Full name if captured |
| `phone`        | string?  | |
| `website`      | string?  | Their site, if known |
| `anonymousIds` | string[] | Pre-identification analytics IDs linked to this lead |
| `sources`      | string[] | E.g. `signal_score`, `contact_form`, `demo_request`, `content_plan` |
| `score`        | number?  | Future lead score |
| `signalScore`  | number?  | Most recent Signal Score (0–100) |
| `signalUrl`    | string?  | URL audited on the most recent Signal Score |
| `signalCustomer` | string? | The "ideal customer" sentence supplied with that score |
| `lastSeenAt`   | number   | Most recent activity (epoch millis) |
| `createdAt`    | number   | First seen (epoch millis) |

#### `formSubmissions`

Every form on the site lands here. Use `type` to dispatch.

| Field         | Type   | Notes |
|---------------|--------|-------|
| `leadId`      | id?    | Resolves via `leadsReferenced` |
| `anonymousId` | string?| Pre-identification analytics ID |
| `type`        | string | One of: `course_signup`, `email_capture` (newsletter), `contact_form`, `signal_score`, `content_idea_generator`, `demo_request` |
| `data`        | any    | Submission-specific payload (name, message, etc.) |
| `createdAt`   | number | |

For "newsletter signups" specifically, filter `type === "email_capture"`
(plus `course_signup` if you want that to count as newsletter intent too).

For "contacts," filter `type === "contact_form"`.

#### `signalReports`

Output of the Signal Score audit tool — the headline lead-magnet on the site.

| Field                | Type   | Notes |
|----------------------|--------|-------|
| `leadId`             | id     | |
| `url`                | string | Site that was audited |
| `customerDescription`| string | Their stated ideal customer |
| `overallScore`       | number | 0–100 |
| `gruntTest`          | object | `{ pass: bool, explanation: string }` |
| `elements`           | object | Seven element scorecards, each with `score`, `summary`, `analysis`, `businessImpact`, `recommendations[]`. Elements: `character`, `problem`, `guide`, `plan`, `cta`, `stakes`, `transformation` |
| `quickWin`           | string | One specific improvement the consumer should make |
| `strengths`          | string[] | What's already working |
| `fullSummary`        | string | LLM-written summary |
| `status`             | string | `success`, `fetch_failed`, `llm_failed`, `rate_limited` |
| `accessLevel`        | string | `public` (basic view) or `verified` (after email verify) |
| `createdAt`          | number | |

#### `demoRequests`

A prospect has explicitly asked Dreamfree to build them a demo homepage.
Hot leads — these are the most actionable.

| Field            | Type   | Notes |
|------------------|--------|-------|
| `leadId`         | id     | |
| `firstName`      | string | |
| `email`          | string | |
| `phone`          | string?| |
| `businessName`   | string | |
| `website`        | string?| |
| `industry`       | string | |
| `idealCustomer`  | string | |
| `mainGoal`       | string | |
| `likedSites`     | string?| Reference sites they like |
| `brandNotes`     | string?| |
| `additionalInfo` | string?| |
| `status`         | string | `requested`, `in_progress`, `demo_complete`, `notification_sent`, `customer_reviewed`, `followed_up`, `won`, `lost` |
| `createdAt`      | number | |
| `updatedAt`      | number | |

#### `contentPlans`

90-day content plan generated by the content-idea tool.

| Field                  | Type   | Notes |
|------------------------|--------|-------|
| `leadId`               | id     | |
| `input`                | object | `{ name, email, businessDescription, goal, channelsTried[], frustration, timePerWeek, website? }` |
| `summary`              | string | LLM-written exec summary |
| `ideas`                | object[] | 6 ideas; each `{ title, format, keyword, why, brief, timeEstimate, priority }` |
| `status`               | string | `success` or `failed` |
| `createdAt`            | number | |

#### `callbackRequests`

A lead has reviewed their Signal Score and asked for a call.

| Field        | Type   | Notes |
|--------------|--------|-------|
| `leadId`     | id     | |
| `reportId`   | id     | The signal report they're calling about |
| `phone`      | string | |
| `status`     | string | `pending`, `contacted`, `closed` |
| `createdAt`  | number | |

#### `events`

Raw analytics events (page views, clicks, form interactions). Volume is high
relative to other tables — consider summarising rather than listing in the
brief.

| Field         | Type   | Notes |
|---------------|--------|-------|
| `type`        | string | E.g. `page_view`, `form_submitted` |
| `anonymousId` | string | |
| `leadId`      | id?    | If the visitor has been resolved |
| `sessionId`   | string | |
| `path`        | string | URL path |
| `properties`  | any    | Event-specific props |
| `timestamp`   | number | |

#### `emailSends`

Outbound emails the system has sent (Resend integration).

| Field           | Type   | Notes |
|-----------------|--------|-------|
| `enrollmentId`  | id?    | If part of a sequence |
| `leadId`        | id     | |
| `subject`       | string | |
| `resendId`      | string?| Resend's id for the message |
| `status`        | string | `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed` |
| `openedAt`      | number?| |
| `clickedAt`     | number?| |
| `sentAt`        | number | |

#### `emailEnrollments`

Lead is on an email sequence. Currently unused; may populate later.

#### `tags`, `leadTags`

Tagging system. Currently unused; arrays will be empty.

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

## Examples

### Curl, "what's new since I last asked"

```sh
curl -H "Authorization: Bearer $DREAMFREE_KEY" \
     https://dreamfree.co.uk/api/mission-control/activity
```

### Curl, explicit 24-hour window

```sh
curl -H "Authorization: Bearer $DREAMFREE_KEY" \
     "https://dreamfree.co.uk/api/mission-control/activity?since=2026-05-04T00:00:00Z&until=2026-05-05T00:00:00Z"
```

### Node / TypeScript

```ts
const res = await fetch(
  "https://dreamfree.co.uk/api/mission-control/activity",
  { headers: { Authorization: `Bearer ${process.env.DREAMFREE_KEY}` } },
);
if (!res.ok) throw new Error(`Mission control fetch failed: ${res.status}`);
const activity = await res.json();
```

### Python

```python
import os, requests

r = requests.get(
    "https://dreamfree.co.uk/api/mission-control/activity",
    headers={"Authorization": f"Bearer {os.environ['DREAMFREE_KEY']}"},
    timeout=30,
)
r.raise_for_status()
activity = r.json()
```

## Briefing-system guidance

Concrete suggestions for what the briefing system should highlight from each
payload (in priority order):

1. **`demoRequests` with status `requested`** — hottest signal. Lead has
   asked Dreamfree to build them something. List name, business, industry,
   `mainGoal`, and link to follow up.

2. **`callbackRequests` with status `pending`** — they want a call. Show
   name, phone, and the `overallScore` from the linked signalReport.

3. **`signalReports`** — list each new audit with `overallScore`, `url`,
   the prospect's `customerDescription`, the `quickWin`, and the lead's
   email (resolve via `leadsReferenced[leadId]`). High-quality cold-outreach
   raw material.

4. **`formSubmissions` where `type === "contact_form"`** — direct enquiries.
   Surface the `data.message` and contact details.

5. **`contentPlans`** — flag any whose `input.timePerWeek` mentions
   "outsource" as warm leads (they've signalled intent to pay someone).

6. **`formSubmissions` where `type === "email_capture"`** — newsletter
   signups. Count and list, but lower priority than the above.

7. **`emailSends` aggregated by status** — engagement summary
   (delivered / opened / clicked / bounced totals).

8. **`events` totals** — brief traffic summary (count of `page_view` events,
   distinct sessions). Don't list individual events.

9. **New `leads` not already in any of the above lists** — leftover
   first-touch contacts not already surfaced.

When joining, always resolve `leadId` via `leadsReferenced` before
displaying — never expose a raw Convex id in the brief.

## Operational notes

- Times are UTC epoch millis. The site's audience is UK-based; convert to
  Europe/London for human display.
- The endpoint is read-only and idempotent **except** for the `lastCalledAt`
  side effect on the API key. If you need to test without "consuming" the
  cursor, pass an explicit `since` and `until`.
- If a key is compromised, revoke it via Convex
  (`apiKeys:revokeKey { id: "<keyId>" }`) and create a new one.
- All amounts shown are GBP unless explicitly noted.

## Versioning

This is v1. Breaking changes will be communicated by deploying a new path
(e.g. `/api/mission-control/v2/activity`) so existing consumers continue to
work.

## See also

- [`docs/signal-report-api.md`](./signal-report-api.md) — the outbound API for generating Signal Reports against arbitrary prospect URLs (separate API; same `apiKeys` table for auth).
