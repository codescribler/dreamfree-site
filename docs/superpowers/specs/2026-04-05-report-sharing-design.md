# Report Sharing & PDF Download — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Goal

Let verified report viewers share their Signal Score report with others (capturing recipient emails as connected leads) and download it as a PDF. Turn every share into a lead capture opportunity.

## Features

### 1. Share by Email (Lead Capture)

**User flow:**
1. Verified user sees a "Share this report" section on the report page
2. They enter one or more comma-separated email addresses and an optional personal message
3. On submit, each recipient is saved as a lead connected to the original sharer
4. Each recipient receives an email with a magic link granting full verified access
5. Daniel receives a log email showing who shared with whom

**API route:** `POST /api/report/[id]/share`

**Request body:**
```json
{
  "emails": "partner@example.com, marketer@example.com",
  "message": "Take a look at our website score",
  "sharerName": "John",
  "sharerEmail": "john@example.com"
}
```

**Backend logic:**
1. Validate report exists and is a successful report
2. Parse and validate email addresses (split on comma, trim, validate format)
3. For each recipient email:
   a. Generate a unique share token (`randomBytes(32).toString("base64url")`)
   b. Save a share record in Convex via a new `signalReports.addShareToken` mutation that appends to a `shareTokens` array on the report: `{ email, token, sharedBy, createdAt }`
   c. Create/upsert a lead via `leads.upsertLeadPublic` with `source: "shared_report"` and the original lead's website
4. Send each recipient an email via Resend (from "Daniel at Dreamfree") containing:
   - Who shared it and their optional message
   - The score and what it means
   - A magic link: `/report/[id]?share_token=[token]`
5. Send Daniel a log email with sharer info and all recipient emails
6. Return `{ success: true, count: N }`

**Report page token handling:**
- Extend the existing access tier logic in `app/report/[id]/page.tsx` to also check `searchParams.share_token` against the report's `shareTokens` array
- If matched: set verification cookie, grant verified tier (same as existing magic link flow)

**Convex schema changes:**
- Add `shareTokens` field to `signalReports` table: `v.optional(v.array(v.object({ email: v.string(), token: v.string(), sharedBy: v.string(), createdAt: v.number() })))`

### 2. Print to PDF

**Approach:** `window.print()` with `@media print` CSS. No library needed.

**"Download PDF" button:** Client component that calls `window.print()`.

**Print CSS additions to `globals.css`:**
- Hide: header, footer, grain overlay, interactions, share section, action bar, verify prompt, create account prompt, report CTA buttons
- Show: a print-only Dreamfree header (logo + "Signal Score Report") and footer (report URL + date)
- Typography: force black text on white background
- Page breaks: `break-inside: avoid` on cards and sections
- Score ring: ensure it renders properly in print (static display)

### 3. Social Sharing

**Buttons:** LinkedIn and X (Twitter), opening in a new popup window.

**Pre-filled text:**
- **LinkedIn:** `"My website just scored [X]/100 on the Signal Method — a five-element messaging audit by Dreamfree. [URL]"`
- **X:** `"My website scored [X]/100 on The Signal Method audit by @dreamaborig [URL]"` (or Dreamfree's X handle if it exists)

**Score-based messaging:**
- Score >= 60: Show a celebratory banner above share buttons: "Your site scored above average — share the good news!"
- Score < 60: Show buttons without the banner, no discouragement

**Share URLs:**
- LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=[encodedURL]`
- X: `https://twitter.com/intent/tweet?text=[encodedText]&url=[encodedURL]`

### 4. Action Bar

**Position:** Sticky bar at the bottom of the viewport, visible only to verified users.

**Buttons (left to right):**
1. Download PDF (printer icon)
2. Share by Email (envelope icon) — scrolls to / opens the share form
3. Share on LinkedIn (LinkedIn icon)
4. Share on X (X icon)

**Styling:** Matches existing design system — `bg-white` with top border and subtle shadow, `rounded-t-2xl`, buttons use existing teal/ghost button styles. Hidden on print.

**Mobile:** Buttons stack into a 2x2 grid on small screens.

## New Files

| File | Purpose |
|------|---------|
| `app/api/report/[id]/share/route.ts` | Share API endpoint |
| `components/report/ReportActions.tsx` | Sticky action bar (client component) |
| `components/report/ShareForm.tsx` | Email share form (client component) |

## Modified Files

| File | Change |
|------|--------|
| `app/report/[id]/page.tsx` | Add share_token check to access tier logic; render ShareForm, ReportActions |
| `app/globals.css` | Add `@media print` styles |
| `convex/signalReports.ts` | Add `addShareToken` mutation |
| `convex/schema.ts` | Add `shareTokens` field to signalReports table |
| `convex/emails.ts` | Add `sendShareEmail` action |

## Out of Scope

- Tracking social share clicks (no backend analytics for this)
- Rate limiting shares (trust users for now; revisit if abused)
- Revoking share tokens
