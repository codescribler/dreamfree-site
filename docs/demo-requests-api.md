# Demo Requests API

Lets an external system (Daniel's local demo-builder) inspect inbound demo
requests on dreamfree.co.uk, advance them through the dashboard Trello board,
and attach a deployed demo URL once the demo is live.

All endpoints live under `https://dreamfree.co.uk/api/v1/demo-requests`.

## Authentication

Every request requires a Dreamfree API key in the `Authorization` header:

```
Authorization: Bearer <KEY>
```

Keys are minted via the Convex `apiKeys:createKey` action — the raw key is
shown once at creation and never again; the server stores SHA-256 hashes
only. Keys can be revoked via `apiKeys:revokeKey`. The same key works for
this API, the [Signal Report API](./signal-report-api.md), and the
[Mission Control API](./mission-control-api.md).

Missing or invalid keys return `401 { "error": "unauthorized" }`.

## Status lifecycle (matches the dashboard board)

```
requested → in_progress → demo_complete → notification_sent → customer_reviewed
                                                                    ↘
                                              followed_up           won / lost
```

Board column → status mapping:

| Column        | Status              |
|---------------|---------------------|
| Requested     | `requested`         |
| In Progress   | `in_progress`       |
| Ready         | `demo_complete`     |
| Delivered     | `notification_sent` |
| Viewed        | `customer_reviewed` |

`followed_up`, `won`, and `lost` are post-viewing states that don't appear on
the active board — they're surfaced as counts only.

## Endpoints

### `GET /api/v1/demo-requests`

List demo requests, newest first, with optional filters.

**Query parameters (all optional):**

| Param    | Type                       | Notes                                                                    |
|----------|----------------------------|--------------------------------------------------------------------------|
| `status` | comma-separated status names | E.g. `?status=requested,in_progress`. Unknown values return 400.        |
| `since`  | epoch millis               | Only include rows with `updatedAt >= since`. Cheap polling cursor.       |
| `limit`  | integer 1–500              | Default 100.                                                             |

**Response 200:**

```json
{
  "key": { "name": "<keyName>" },
  "demoRequests": [
    {
      "_id": "j97abc...",
      "_creationTime": 1715980800000,
      "leadId": "k01def...",
      "firstName": "Cameron",
      "email": "cameron.law@example.co.uk",
      "phone": "+44...",
      "businessName": "Breeze Removals",
      "website": "https://breezeremovals.co.uk",
      "industry": "Removals",
      "idealCustomer": "Local homeowners moving within 50 miles",
      "mainGoal": "More inbound enquiries",
      "likedSites": "...",
      "brandNotes": "...",
      "additionalInfo": "...",
      "status": "requested",
      "demoUrl": null,
      "demoDeployedAt": null,
      "signalReportId": "h44ghi...",
      "createdAt": 1715980800000,
      "updatedAt": 1715980800000
    }
  ]
}
```

### `GET /api/v1/demo-requests/{id}`

Fetch one demo with its linked lead and (if applicable) the originating
Signal Score report.

**Response 200:**

```json
{
  "key": { "name": "<keyName>" },
  "demoRequest": { ...same shape as in the list endpoint... },
  "lead": {
    "_id": "k01def...",
    "email": "cameron.law@example.co.uk",
    "firstName": "Cameron",
    "anonymousIds": [...],
    "sources": ["api_outbound"],
    "signalScore": 31,
    "signalUrl": "https://breezeremovals.co.uk",
    "signalCustomer": "Local homeowners moving within 50 miles",
    "leadType": "outbound",
    "firstEngagedAt": null,
    "lastEngagedAt": null,
    "engagementCount": null,
    "createdAt": 1715980800000,
    "lastSeenAt": 1715980800000
  },
  "signalReport": {
    "_id": "h44ghi...",
    "_creationTime": 1715980800000,
    "url": "https://breezeremovals.co.uk",
    "customerDescription": "Local homeowners moving within 50 miles",
    "overallScore": 31,
    "gruntTest": { "pass": false, "explanation": "..." },
    "elements": {
      "character": { "score": 4, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": [...] },
      "problem":   { ... },
      "guide":     { ... },
      "plan":      { ... },
      "cta":       { ... },
      "stakes":    { ... },
      "transformation": { ... }
    },
    "quickWin": "...",
    "strengths": [...],
    "fullSummary": "...",
    "status": "success",
    "accessLevel": "verified",
    "firstViewedAt": null,
    "viewCount": null,
    "createdViaApiKeyId": "...",
    "createdAt": 1715980800000
  }
}
```

`signalReport` is `null` when the demo wasn't triggered from a Signal Score
audit (most direct demo-page submissions). Legacy rows that predate the
dedicated `signalReportId` column are still resolved — the API also parses
the report id out of `demoRequest.additionalInfo` as a fallback.

**404** if the id doesn't exist; **400** if the id is malformed.

### `POST /api/v1/demo-requests/{id}/status`

Change a demo request's status. Any status is accepted; the demo-builder is
trusted to keep the lifecycle moving forward (the dashboard provides the
same any-to-any escape hatch via a per-card dropdown).

**Body:**

```json
{ "status": "in_progress" }
```

Valid `status` values:

```
requested | in_progress | demo_complete | notification_sent |
customer_reviewed | followed_up | won | lost
```

**Response 200:** `{ "ok": true, "key": { "name": "..." } }`

**400** on unknown status or invalid body.

Typical use: your local system polls `GET /api/v1/demo-requests?status=requested`
on a schedule; when it picks one up for processing, it calls this endpoint
with `status: "in_progress"` so the dashboard card moves to the In Progress
column.

### `POST /api/v1/demo-requests/{id}/deploy`

Attach a deployed demo URL. Stamps `demoUrl`, `demoDeployedAt`, and — when
the card is currently in `requested` or `in_progress` — advances `status`
to `demo_complete` (the "Ready" column). Later statuses are **not**
downgraded: re-running this on a card already in `won` just refreshes the
URL.

**Body:**

```json
{ "demoUrl": "https://demos.example.com/breeze-removals" }
```

The URL must start with `http://` or `https://`. There's no allow-list of
domains; whatever you POST gets shown on the dashboard card as a clickable
link.

**Response 200:** `{ "ok": true, "key": { "name": "..." } }`

## Example workflows

### Pick up a new demo, build it, deploy it

```bash
# 1. Find pending requests
curl -s -H "Authorization: Bearer $DREAMFREE_KEY" \
  "https://dreamfree.co.uk/api/v1/demo-requests?status=requested" \
  | jq '.demoRequests[] | {id: ._id, business: .businessName, url: .website}'

# 2. Pull full detail (lead + signal report) for the one you want
curl -s -H "Authorization: Bearer $DREAMFREE_KEY" \
  "https://dreamfree.co.uk/api/v1/demo-requests/$ID"

# 3. Mark as in progress
curl -s -X POST -H "Authorization: Bearer $DREAMFREE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' \
  "https://dreamfree.co.uk/api/v1/demo-requests/$ID/status"

# 4. ... build the demo, deploy it ...

# 5. Attach the deployed URL (also moves card to "Ready")
curl -s -X POST -H "Authorization: Bearer $DREAMFREE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"demoUrl":"https://demos.example.com/breeze-removals"}' \
  "https://dreamfree.co.uk/api/v1/demo-requests/$ID/deploy"
```

### Cursor polling (recommended)

```ts
let since = Number(await fs.readFile("./.cursor.json", "utf8").catch(() => "0"));
const res = await fetch(
  `https://dreamfree.co.uk/api/v1/demo-requests?status=requested&since=${since}`,
  { headers: { Authorization: `Bearer ${process.env.DREAMFREE_KEY}` } },
);
const { demoRequests } = await res.json();
for (const r of demoRequests) {
  // ... process ...
}
const newest = demoRequests.reduce((acc, r) => Math.max(acc, r.updatedAt), since);
await fs.writeFile("./.cursor.json", String(newest));
```

## Notes on the dashboard board

The board at `https://dreamfree.co.uk/dashboard/demos` reads the same Convex
table. State changes pushed via the API show up there immediately
(Convex subscriptions are reactive). Conversely, Daniel changing a card by
hand on the dashboard is visible to the next API poll.

## Versioning

This is v1 of the demo requests API. Breaking changes will be released on
a new path (e.g. `/api/v1/demo-requests/v2/...`) so existing consumers
continue to work.

## See also

- [`docs/signal-report-api.md`](./signal-report-api.md) — outbound API for generating Signal Reports.
- [`docs/mission-control-api.md`](./mission-control-api.md) — read-all-activity briefing endpoint.
