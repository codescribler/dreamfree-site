# Report Access & Payment Design

## Goal

Replace the Clerk auth-gated Signal Score report page with a three-tier access model: public (immediate), verified (email code/magic link), and paid (Stripe Checkout). Remove friction from the free experience while monetising the full analysis. Account creation happens after payment, not before.

## Background

The Signal Score grader collects the visitor's email during the modal flow. The report is already generated and stored in Convex. The current system requires Clerk sign-in to view even the teaser — this adds unnecessary friction since the visitor already provided their email.

---

## Access Tiers

| Tier | What the visitor sees | How they get it |
|------|----------------------|-----------------|
| **Public** | Score ring, grunt test pass/fail + explanation, quick win | Complete the Signal Score modal flow — redirected to report page immediately |
| **Verified** | All 7 element scores with summaries, strengths list | Enter 6-digit code from email OR click magic link in email |
| **Paid** | Full analysis paragraphs, all 7 recommendations, full summary, future add-ons | Pay via Stripe Checkout — £7 within 1 hour of first view, £27 after |

Admin (daniel@dreamfree.co.uk) always sees everything, no verification or payment needed.

---

## Report Page Layout

Top to bottom:

| Zone | Tier required | Content |
|------|--------------|---------|
| Header | Public | URL, date, "Signal Score Report" label |
| Score Ring | Public | Animated overall score /100 |
| Grunt Test | Public | Pass/fail badge + explanation |
| Quick Win | Public | The #1 quick win |
| Verify Prompt | Public (hidden once verified) | Code input + "check your email for a magic link" |
| Strengths | Verified | "What your site does well" list |
| Element Scores | Verified | All 7 elements: name, score bar, summary. Analysis + recommendation blurred/hidden |
| Buy Prompt | Verified (hidden once paid) | Price, countdown timer, Stripe checkout button |
| Full Analysis | Paid | Analysis paragraphs and recommendations for all 7 elements, full summary |
| Create Account Prompt | Shown after payment if no Clerk account | "Save your access — set a password" with pre-filled email |
| Footer CTA | Always | "Want someone to fix this for you?" — call Daniel |

Prompts disappear once their tier is reached.

---

## Data Model Changes

### `signalReports` table modifications

**Changed fields:**
- `accessLevel`: `locked | unlocked` becomes `public | verified | paid`

**New fields:**
- `verifyCode: string` — 6-digit numeric code, generated at report creation
- `verifyToken: string` — random URL-safe token for magic link
- `firstViewedAt: number (optional)` — timestamp of first report page visit, starts the 1-hour pricing countdown
- `stripeSessionId: string (optional)` — Stripe Checkout session ID
- `paidAt: number (optional)` — timestamp of successful payment
- `paidAmount: number (optional)` — amount in pence (700 or 2700)
- `clerkUserId: string (optional)` — linked after post-payment account creation

No new tables required.

---

## Verification Flow

### Report creation (API route, after successful analysis)

1. Generate a 6-digit numeric code (cryptographically random)
2. Generate a random URL-safe token (32 bytes, base64url encoded)
3. Store both on the `signalReports` record
4. Include both in the visitor email:
   - Magic link: `{siteUrl}/report/{id}?token={verifyToken}`
   - 6-digit code as readable text with instructions

### Magic link arrival

1. Report page (server component) checks for `?token=xxx` query param
2. Validates against `verifyToken` on the report record
3. If valid: sets an HTTP-only signed cookie (`df_report_{id}`) and redirects to strip the token from the URL
4. Visitor sees verified tier content

### Manual code entry

1. Visitor types 6-digit code into input on the report page
2. Client POSTs to `/api/report/{id}/verify` with the code
3. Server validates against `verifyCode` on the report record
4. If valid: sets the same HTTP-only signed cookie, returns success
5. Page reloads to show verified tier

### Cookie specification

- HTTP-only, signed with `REPORT_SIGNING_SECRET` env var
- Scoped to `/report/{id}` path
- Contains: report ID, verification timestamp
- No expiry — verified access is permanent for that browser

### Admin bypass

- Report page checks for Clerk session via `currentUser()`
- If signed-in user's email === `daniel@dreamfree.co.uk` → full access, all prompts hidden

---

## Payment Flow

### Pricing logic

- `firstViewedAt` is set on the first page load (server-side, if not already set)
- Price calculation: if `Date.now() - firstViewedAt < 3_600_000` → £7, else → £27
- Countdown timer visible on the buy prompt (client-side, ticking down from `firstViewedAt`)

### Stripe Checkout

1. Visitor clicks "Unlock Full Report" button
2. Client calls `/api/report/{id}/checkout`
3. Server determines price from `firstViewedAt` (not from client — prevents manipulation)
4. Server creates a Stripe Checkout Session:
   - `mode: "payment"`
   - `line_items`: one item, dynamically priced (£7 or £27)
   - `metadata.reportId`: the Convex report ID
   - `client_reference_id`: the Convex report ID
   - `customer_email`: pre-filled from the lead record
   - `success_url`: `/report/{id}?paid=1`
   - `cancel_url`: `/report/{id}`
5. Client redirects to Stripe Checkout URL

### Stripe products

Two prices in Stripe dashboard:
- "Signal Score Report (Early Bird)" — £7.00
- "Signal Score Report" — £27.00

These are created manually in the Stripe dashboard. The API route selects the correct price ID based on the timer.

### Webhook: payment completion

- Endpoint: `/api/webhooks/stripe`
- Listens for `checkout.session.completed`
- Extracts `reportId` from session metadata
- Updates report: `accessLevel: "paid"`, `paidAt: Date.now()`, `paidAmount` (from session), `stripeSessionId`

### Post-payment return

- Visitor returns to `/report/{id}?paid=1`
- Page sees `accessLevel: "paid"` → shows full content
- The `?paid=1` param triggers the "Create your account" prompt

---

## Account Creation (Post-Payment)

### When shown

- `accessLevel === "paid"` AND no `clerkUserId` on the report

### UI

- Simple inline card on the report page (not a modal or separate page)
- Email field: pre-filled, read-only (from lead record)
- Password field: single input
- "Save My Access" button
- "Skip for now" link

### On submit

1. Client calls `/api/report/{id}/create-account`
2. Server creates a Clerk user via the Clerk Backend API (email + password)
3. Server links `clerkUserId` to the report record
4. Server signs the user in (sets Clerk session)
5. Page refreshes — account prompt disappears

### If skipped

- The verification cookie still grants access to all content (report is marked `paid`)
- Follow-up email from Daniel can nudge account creation
- They can always create an account later by signing up with the same email

### Returning paid users

- Signed in via Clerk AND `clerkUserId` matches report → full paid access on any device
- Not signed in but have verification cookie AND report `accessLevel === "paid"` → full paid access in that browser

---

## Email Changes

The visitor email (`sendSignalScoreToVisitor`) is updated to include:

1. The magic link: clickable button/link to `/report/{id}?token={verifyToken}`
2. The 6-digit code: displayed as readable text ("Or enter this code: 847291")
3. Updated copy: no longer mentions "Sign up to see your breakdown" — instead encourages clicking the link

---

## What Gets Removed

- Clerk auth check (`currentUser()` + `redirect()`) on the report page for non-admin visitors
- `PaywallOverlay` component — replaced by `VerifyPrompt`, `BuyPrompt`, `CreateAccountPrompt`
- Binary `locked | unlocked` access level

## What Stays

- Clerk sign-in/sign-up pages — still used for `/dashboard` and post-payment account creation
- Clerk middleware in `proxy.ts` — still runs for dashboard protection
- Admin access check — still uses Clerk `currentUser()`

## New Files

- `/api/report/[id]/verify/route.ts` — code verification endpoint
- `/api/report/[id]/checkout/route.ts` — creates Stripe Checkout session
- `/api/webhooks/stripe/route.ts` — handles payment completion
- `components/report/VerifyPrompt.tsx` — code input + magic link message
- `components/report/BuyPrompt.tsx` — price, countdown timer, checkout button
- `components/report/CreateAccountPrompt.tsx` — post-payment password setup

## New Environment Variables

- `REPORT_SIGNING_SECRET` — for signing verification cookies
- `STRIPE_SECRET_KEY` — for creating Checkout sessions
- `STRIPE_WEBHOOK_SECRET` — for verifying webhook signatures
- `STRIPE_PRICE_EARLY` — Stripe Price ID for £7 early bird
- `STRIPE_PRICE_STANDARD` — Stripe Price ID for £27 standard

## Future Extension Points

- Add-on products (AI copy prompts, etc.) can be additional Stripe prices, gated behind `paid` access level
- The `signalReports` table can accommodate additional fields for purchased add-ons
- The Clerk account gives a natural home for a "My Reports" dashboard if needed later
