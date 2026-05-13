# Signal Report API

Authenticated HTTP API for generating Signal Score reports against arbitrary
websites from outside the dreamfree.co.uk site. Designed for outbound outreach
tooling: pass in a prospect's URL and contact details, get back a structured
JSON audit and a shareable link the prospect can open without an email gate.

This is the outbound counterpart to the public `/signal-score` form on the
website. The same Signal Method scoring engine and report viewer is used for
both — the API is just an alternative entry point with different lead-handling
and access semantics.

## Endpoints

| Method | Path                              | Purpose                                  |
|--------|-----------------------------------|------------------------------------------|
| `POST` | `/api/v1/signal-reports`          | Create a report from a URL + contact     |
| `GET`  | `/api/v1/signal-reports/{id}`     | Poll status; fetch full JSON when ready  |

Production base: `https://dreamfree.co.uk`.
Dev base: `http://localhost:3000`.

## Authentication

Every request must include a Dreamfree API key in the `Authorization` header:

```
Authorization: Bearer <KEY>
```

Keys are minted from the Dreamfree dashboard at
`/dashboard/admin/api-keys` (admin login required) or directly via the Convex
`apiKeys:createKey` action. The raw key is shown **exactly once** at creation
— store it in your secret manager immediately. The server retains only the
SHA-256 hash; the key cannot be recovered later.

A request with a missing, malformed, or revoked key returns:

```
HTTP/1.1 401 Unauthorized
{ "error": "unauthorized" }
```

The same response is returned for every failure mode (missing header, wrong
scheme, unknown key, revoked key) so an attacker cannot probe for valid keys
by observing different error messages.

To revoke a key, use the dashboard's "Revoke" button or call
`apiKeys:revokeKey { id: "<keyId>" }` directly. Revoked keys remain in the
table (greyed out) so historical attribution from `signalReports.createdViaApiKeyId`
continues to resolve.

## Create a report

```
POST /api/v1/signal-reports
Content-Type: application/json
Authorization: Bearer <KEY>
```

### Request body

| Field                 | Type     | Required | Notes |
|-----------------------|----------|----------|-------|
| `url`                 | string   | yes      | Site to analyse. `https://` is added if the value doesn't start with `http`. |
| `customerDescription` | string   | yes      | One-sentence description of who the prospect's site is for. Feeds the LLM prompt and shapes the audit's framing. |
| `firstName`           | string   | yes      | Stored on the lead record. Used in the report viewer if the prospect logs in later. |
| `email`               | string   | yes      | Lower-cased server-side and used as the lead's primary identity. **No verification email is sent.** |
| `phone`               | string   | no       | Stored on the lead. |
| `wait`                | boolean  | no       | If `true`, the request blocks for up to 25 seconds waiting for the LLM to finish. If generation completes in time, the response includes the full `report` payload. Otherwise the response is the same as the async default and you fall back to polling. Default: `false`. |

### Default response (async)

`200 OK`. Returned within a few hundred milliseconds — the report is queued
and processed asynchronously.

```json
{
  "reportId": "j97abc1d2e3f4g5h6i7j8k9l0m",
  "status": "pending",
  "viewUrl": "https://dreamfree.co.uk/report/j97abc1d2e3f4g5h6i7j8k9l0m?token=<256-bit-base64url>",
  "pollUrl": "https://dreamfree.co.uk/api/v1/signal-reports/j97abc1d2e3f4g5h6i7j8k9l0m"
}
```

`reportId` is a Convex document id (random, opaque, not enumerable). Use it to
poll the GET endpoint or to look the report up in the dashboard.

`viewUrl` is the human-facing report. It is safe to email directly to the
prospect — it auto-unlocks the full report (no email gate). See [The view
link](#the-view-link) for what's in it and what's not.

`pollUrl` is provided as a convenience; it equals
`{base}/api/v1/signal-reports/{reportId}`.

### Long-poll response (`wait=true`)

If you pass `"wait": true` in the body **and** the LLM finishes within ~25
seconds (typical case for small sites), the response includes the same fields
plus `status: "success"` and a populated `report` object:

```json
{
  "reportId": "...",
  "status": "success",
  "viewUrl": "...",
  "pollUrl": "...",
  "report": { /* see GET response below */ }
}
```

If generation hasn't finished by the timeout, the response is identical to the
async default (status: pending) and you fall back to polling the GET endpoint.
The background generation continues regardless of whether the request connection
is held open.

Use `wait=true` for one-shot scripts where simplicity matters more than
latency. For high-volume outreach, prefer the async default + polling — it
keeps the request connection short and lets the caller fan out.

### Errors

| Status | Body                                                       | When |
|--------|------------------------------------------------------------|------|
| `400`  | `{ "error": "invalid_json" }`                              | Body could not be parsed. |
| `400`  | `{ "error": "missing_fields", "fields": ["..."] }`         | One or more required fields missing. The `fields` array lists the missing names. |
| `401`  | `{ "error": "unauthorized" }`                              | Missing, malformed, or revoked bearer token. |
| `502`  | `{ "error": "fetch_failed", "detail": "...", "reportId": "..." }` | Could not fetch or extract enough content from the supplied URL. The report row is still saved (status `fetch_failed`) so it appears in the dashboard. No `viewUrl` is returned because failed reports have no shareable token. |

The site fetch is performed on the request path (with a 10-second timeout)
specifically so the caller learns about an unreachable URL immediately rather
than queuing a doomed report.

## Get a report

```
GET /api/v1/signal-reports/{id}
Authorization: Bearer <KEY>
```

Path parameter: `id` is the `reportId` returned by the POST endpoint.

### Pending response

`200 OK` while the LLM is still working:

```json
{
  "reportId": "...",
  "status": "pending",
  "viewUrl": "https://dreamfree.co.uk/report/...?token=..."
}
```

The `viewUrl` is valid immediately — a prospect who opens it before the report
finishes will see a live-updating "your report is being prepared" page that
swaps in the full report when generation completes.

### Success response

`200 OK` once the LLM has finished:

```json
{
  "reportId": "...",
  "status": "success",
  "viewUrl": "...",
  "report": {
    "url": "https://example.com",
    "customerDescription": "homeowners needing emergency plumbing",
    "overallScore": 6.4,
    "gruntTest": {
      "pass": true,
      "explanation": "A first-time visitor can tell what the company does, who it's for, and how to take the next step within the first screen."
    },
    "elements": {
      "character":      { "score": 7, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "problem":        { "score": 5, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "guide":          { "score": 6, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "plan":           { "score": 4, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "cta":            { "score": 8, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "stakes":         { "score": 3, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] },
      "transformation": { "score": 6, "summary": "...", "analysis": "...", "businessImpact": "...", "recommendations": ["...", "..."] }
    },
    "quickWin": "Add a single sentence below the hero stating who the service is for and the outcome they get — currently the page asks the visitor to infer both.",
    "strengths": [
      "Clear contact phone number in the header",
      "Strong testimonials with named customers"
    ],
    "fullSummary": "..."
  }
}
```

#### Field reference

| Field                          | Type      | Notes |
|--------------------------------|-----------|-------|
| `report.url`                   | string    | The URL that was audited (echoed from the POST request). |
| `report.customerDescription`   | string    | The ideal-customer sentence supplied at creation time. |
| `report.overallScore`          | number    | 0–10. Weighted aggregate of the seven elements. |
| `report.gruntTest.pass`        | boolean   | Whether the homepage passes the StoryBrand "grunt test" — can a first-time visitor instantly identify what the business offers, who it's for, and how to take the next step. |
| `report.gruntTest.explanation` | string    | One-paragraph rationale for the pass/fail. |
| `report.elements.<element>.score`           | number     | 0–10 score for that Signal Method element. |
| `report.elements.<element>.summary`         | string     | One-sentence headline. |
| `report.elements.<element>.analysis`        | string     | Multi-paragraph deep dive on what the site is or isn't doing for this element. |
| `report.elements.<element>.businessImpact`  | string     | Translation into commercial consequences (lost leads, friction, brand perception). |
| `report.elements.<element>.recommendations` | string[]   | Concrete actions the prospect could take. Usually 2–5 items. |
| `report.quickWin`              | string    | One specific, low-effort change the prospect could make today that would move the needle most. Useful as a hook in cold email. |
| `report.strengths`             | string[]  | Things the site already does well. Useful for opening on a positive in outreach. |
| `report.fullSummary`           | string    | Multi-paragraph LLM-written executive summary stitching the elements together. |

The seven elements are always present in the same order:
`character`, `problem`, `guide`, `plan`, `cta`, `stakes`, `transformation`.
See [the Signal Method overview](https://dreamfree.co.uk/the-signal-method)
for what each measures.

### Failure response

`200 OK` (the request itself succeeded, but the underlying generation didn't):

```json
{
  "reportId": "...",
  "status": "fetch_failed",
  "viewUrl": "..."
}
```

`status` will be one of:

- `fetch_failed` — site couldn't be reached or returned too little content. The viewer page will show an error state.
- `llm_failed` — the model failed to return valid output after retries. Daniel can re-run from the dashboard if needed.

The `viewUrl` for failed reports does not contain a usable token (the report
has none), so it links to the report's error state.

### Errors

| Status | Body                                | When |
|--------|-------------------------------------|------|
| `401`  | `{ "error": "unauthorized" }`       | Missing, malformed, or revoked bearer token. |
| `404`  | `{ "error": "not_found" }`          | Report id does not exist (or is malformed). |

## Polling guidance

The LLM typically completes in 10–30 seconds. Recommended cadence:

- First poll: 5 seconds after POST.
- Subsequent polls: every 2 seconds.
- Hard timeout: 60 seconds (after that, treat the report as still pending and check the dashboard if it never resolves).

The `status` field transitions through this state machine exactly once:

```
pending  ──►  success
       └──►  fetch_failed
       └──►  llm_failed
```

Once the status is anything other than `pending`, it will never change again.
You can stop polling.

If you want push notifications instead of polling, none are wired in v1.
A webhook callback per API key is on the roadmap; ping the maintainer if you
need it sooner.

## The view link

The `viewUrl` is a self-contained, shareable URL of the form:

```
https://dreamfree.co.uk/report/{reportId}?token={verifyToken}
```

- `reportId` is the random Convex id.
- `token` is a 256-bit `crypto.randomBytes` value, base64url-encoded.

Nothing else is in the URL. No leadId, no email, no firstName, no phone,
no campaign reference, no sequential counter. A leaked URL exposes the
contents of one report only — no enumeration of other reports or leads is
possible from it.

The token is per-report. Each call to POST mints a fresh one. Revoking the
API key does **not** invalidate previously-issued view URLs (the token lives
on the report row, not the key) — if you need to nuke a link, delete the
report row from the Convex dashboard.

Reports created via this API are pre-verified server-side
(`accessLevel: "verified"`), so the prospect lands directly on the unrestricted
report. The website's normal email-gate paywall is bypassed for these reports
on the assumption that **you already have the prospect's permission to send
them this link** (they are your prospect, the email was sent to them, the link
is to their report).

## Lead handling

Each successful POST upserts a lead in the Dreamfree CRM keyed on the supplied
`email`. The lead row carries:

| Field            | Behaviour |
|------------------|-----------|
| `leadType`       | Set to `"outbound"` if a new row is created. **Never demoted** — if the email already belongs to an inbound lead, `leadType` stays `"inbound"`. |
| `consentedAt`    | **Not set** for outbound leads. They have not opted in to anything. |
| `sources`        | Includes `"api_outbound"`. If the prospect later submits a form on the website, additional source tags are appended (e.g. `"signal_score"`, `"contact_form"`). |
| `firstName`, `phone`, `website` | Filled in if missing on an existing row. Never overwritten. |

### Promotion to inbound

If a prospect created via the API later submits any form on dreamfree.co.uk
using the same email, their `leadType` is automatically promoted to
`"inbound"` and `consentedAt` is stamped to the moment of submission. This
happens once and is irreversible — a lead never reverts to outbound.

The form submission is the **only** event that constitutes consent.
Specifically:

- Clicking the report `viewUrl` does not constitute consent. (Engagement
  tracking is recorded separately — see roadmap below.)
- Opening or reading the emailed report does not constitute consent.

This separation matters for GDPR / PECR — you can use API-created leads for
1:1 follow-up that you can document a legitimate-interest basis for, but you
must not enrol them in automated marketing sequences without first obtaining
explicit consent through some other channel.

The dashboard surfaces `leadType` so you can filter outbound vs inbound leads
when prospecting. Email-campaigns enrolment also enforces this boundary —
outbound leads are excluded from automated sequences (see the email-campaigns
spec under `docs/superpowers/specs/`).

## Examples

### Curl, async + poll

```sh
KEY="$DREAMFREE_KEY"

# 1. Create the report.
RESP=$(curl -s -X POST https://dreamfree.co.uk/api/v1/signal-reports \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example-plumber.co.uk",
    "customerDescription": "homeowners needing emergency plumbing in Hertfordshire",
    "firstName": "Jane",
    "email": "jane@example-plumber.co.uk"
  }')
REPORT_ID=$(echo "$RESP" | jq -r '.reportId')
VIEW_URL=$(echo "$RESP" | jq -r '.viewUrl')
echo "Report id: $REPORT_ID"
echo "View URL:  $VIEW_URL"

# 2. Poll until ready.
sleep 5
while :; do
  R=$(curl -s "https://dreamfree.co.uk/api/v1/signal-reports/$REPORT_ID" \
       -H "Authorization: Bearer $KEY")
  STATUS=$(echo "$R" | jq -r '.status')
  if [ "$STATUS" != "pending" ]; then
    echo "$R" | jq
    break
  fi
  sleep 2
done
```

### Curl, single-shot with long-poll

```sh
curl -s -X POST https://dreamfree.co.uk/api/v1/signal-reports \
  -H "Authorization: Bearer $DREAMFREE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example-plumber.co.uk",
    "customerDescription": "homeowners needing emergency plumbing",
    "firstName": "Jane",
    "email": "jane@example-plumber.co.uk",
    "wait": true
  }' | jq
```

If the LLM finishes in time the response is the full report; otherwise it
returns `status: "pending"` and you should poll the `pollUrl` from there.

### Node / TypeScript

```ts
const BASE = "https://dreamfree.co.uk";

async function generateReport(input: {
  url: string;
  customerDescription: string;
  firstName: string;
  email: string;
  phone?: string;
}) {
  const create = await fetch(`${BASE}/api/v1/signal-reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DREAMFREE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!create.ok) {
    throw new Error(`POST failed: ${create.status} ${await create.text()}`);
  }
  const { reportId, viewUrl, pollUrl } = await create.json();

  // Poll until ready (60s budget).
  const deadline = Date.now() + 60_000;
  await new Promise((r) => setTimeout(r, 5_000));
  while (Date.now() < deadline) {
    const poll = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${process.env.DREAMFREE_KEY}` },
    });
    const body = await poll.json();
    if (body.status !== "pending") {
      return { ...body, viewUrl };
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Report ${reportId} still pending after 60s`);
}
```

### Python

```python
import os
import time
import requests

BASE = "https://dreamfree.co.uk"
HEADERS = {"Authorization": f"Bearer {os.environ['DREAMFREE_KEY']}"}

def generate_report(url, customer_description, first_name, email, phone=None):
    payload = {
        "url": url,
        "customerDescription": customer_description,
        "firstName": first_name,
        "email": email,
    }
    if phone:
        payload["phone"] = phone

    create = requests.post(
        f"{BASE}/api/v1/signal-reports",
        headers={**HEADERS, "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    create.raise_for_status()
    data = create.json()
    report_id = data["reportId"]
    poll_url = data["pollUrl"]
    view_url = data["viewUrl"]

    time.sleep(5)
    deadline = time.time() + 60
    while time.time() < deadline:
        r = requests.get(poll_url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        body = r.json()
        if body["status"] != "pending":
            body["viewUrl"] = view_url
            return body
        time.sleep(2)
    raise TimeoutError(f"Report {report_id} still pending after 60s")
```

## Outreach pattern

Typical use:

1. Run discovery to identify a list of target prospects (URL + a contact name + email).
2. For each prospect, POST to `/api/v1/signal-reports` and store the returned `reportId` and `viewUrl`.
3. Poll until each report's status is `success` (or `fetch_failed` / `llm_failed` — handle these in your sender by skipping or flagging for manual review).
4. Use the `report` JSON to personalise an outreach email (e.g. open with a `quickWin`, reference one weak `element`, lead with a `strength`).
5. Include the `viewUrl` as the primary CTA. The prospect lands on the unrestricted report immediately.
6. Track engagement separately. (See roadmap below — engagement tracking goes live in Plan 2.)

## Operational notes

- All times are UTC epoch millis. The audience is UK-based; convert to Europe/London for human display.
- The site fetch and report generation respect a `User-Agent: Mozilla/5.0 (compatible; DreamfreeBot/1.0; +https://dreamfree.co.uk)` header. Sites that block this agent will fail with `fetch_failed`.
- Site fetch timeout is 10 seconds. Sites slower than that will fail the fetch step.
- Minimum extracted content is 100 characters of stripped text. Pure-JS sites that ship no useful HTML will fail with `fetch_failed: "Only N chars of content extracted"`.
- There is no per-key rate limit today. A valid key grants unlimited generation. Revocation is the only throttle.
- Reports created via this API show in the dashboard's reports list the same as form-submitted reports. They can be distinguished by the presence of `createdViaApiKeyId` on the row.

## Roadmap

The following are designed and scheduled but not yet shipped. Until they are,
treat the API as a structured-content + share-link service; engagement tracking
belongs to your sender.

- **Engagement tracking on view.** When the prospect opens the `viewUrl`, the system will record `firstViewedAt`, `viewCount`, `firstEngagedAt`, `lastEngagedAt`, and `engagementCount`, and emit an `outbound_report_viewed` event into the existing analytics stream (visible in Mission Control).
- **Cross-site identity cookie.** First click of a `viewUrl` will set a signed `df_lead` cookie carrying only `{ leadId }`. Forms across the marketing site will prefill firstName / email / phone for that visitor via a server-resolved hook. The cookie value is HttpOnly and only reachable by server actions.
- **"Hot outbound prospects" dashboard widget.** Outbound leads with engagement in the last 7 days, sorted by view count.
- **Webhook callbacks per key.** Optional `webhookUrl` on the API key; the system POSTs the completed report to it instead of the caller polling.
- **Bulk endpoint.** `POST /api/v1/signal-reports/batch` for blasts of dozens or hundreds in one call.

The design spec and current implementation plan live in:

- `docs/superpowers/specs/2026-05-12-signal-report-api-design.md` (design spec — engagement layer included)
- `docs/superpowers/plans/2026-05-12-signal-report-api-plan-1-foundations.md` (Plan 1 — what's shipped)

## Versioning

This is `v1`. Breaking changes will be announced and deployed under a new path
prefix (e.g. `/api/v2/signal-reports/...`) so existing consumers continue to
work indefinitely.

## See also

- [`docs/mission-control-api.md`](./mission-control-api.md) — the read-only activity feed for daily briefings (separate API; same `apiKeys` table for auth).
