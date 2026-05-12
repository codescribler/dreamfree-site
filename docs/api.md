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
