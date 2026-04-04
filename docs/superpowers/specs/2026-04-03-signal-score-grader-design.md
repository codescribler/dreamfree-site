# Signal Score Grader — Design Spec

**Date:** 2026-04-03
**Goal:** Replace the fake Signal Score grader (random scores, hardcoded tips) with a real AI-powered website messaging audit tool that analyses a prospect's homepage against the StoryBrand SB7 framework, captures leads, stores full reports, and gates access behind registration and payment tiers.

**Stack:** Next.js API route, OpenRouter (Gemini 2.0 Flash), Convex (storage + rate limiting), Clerk (auth + access control), Resend (email notifications).

---

## 1. What the Signal Score Tests

The Signal Score tests **one element of The Signal Method: clear communication**. It evaluates how well a website's homepage communicates to its ideal customer, using the StoryBrand SB7 messaging framework.

It scores **7 sub-elements**, each 1-10:

| # | Sub-element | What we're looking for |
|---|-------------|----------------------|
| 1 | **Character (The Hero)** | Can a visitor tell in 5 seconds who this site is for? Is the customer positioned as the hero above the fold, or does the site open with "Welcome to [Business Name]"? |
| 2 | **Problem** | Is the external problem stated? Is the internal frustration addressed? Is there a philosophical "it's just wrong that..." framing? Score across all three levels. |
| 3 | **Guide** | Does the business demonstrate empathy ("we understand") AND authority (credentials, experience, methodology)? Or just one? Or neither? |
| 4 | **Plan** | Is there a visible step-by-step plan (ideally 3 steps) that shows the customer exactly what happens next? Is it on the homepage or buried? |
| 5 | **Call to Action** | Is there ONE clear, consistent direct CTA repeated throughout? Is the language consistent or does it shift between "Get Started", "Contact Us", "Book Now"? Is there a transitional CTA for visitors not ready to commit? |
| 6 | **Stakes (Failure)** | Are the consequences of inaction articulated? Does the site create any urgency or just stay relentlessly positive? |
| 7 | **Transformation (Success)** | Is there a vivid "after" picture? Specific outcomes, not generic "we'll help your business grow"? Before/after framing? |

**Plus The Grunt Test:** Can you answer these 3 questions within 5 seconds of landing on the homepage?
- What do you offer?
- How will it make my life better?
- What do I need to do to buy it?

**Scoring:** 7 sub-elements x 10 = 70, normalised to /100.

**Framing to the user:** "This is your Signal Score — how clearly your website communicates to your ideal customer. It's the first element of The Signal Method, and it's the one that matters most."

---

## 2. User Flow

The modal (triggered by any `[data-modal]` CTA) has these steps:

1. **URL** — "What's your website address?"
2. **Customer** — "Describe your perfect customer in one sentence."
3. **Name + Email** — First name and email address combined in one step. Email is required — this is the lead gate. Copy: "We'll send your results to this address."
4. **Analysing...** — Real analysis happens here (3-5 second wait). Status messages cycle as the API route fetches the site and calls the LLM.
5. **Results** — Overall score ring, Grunt Test pass/fail, one quick win, and remaining uses counter.
6. **Limit reached** (when uses = 0) — Instead of showing the grader, the modal opens to: "You've used your 3 free Signal Scores. For a deeper analysis, let's talk." with phone number and email CTAs.

---

## 3. Rate Limiting

- **3 free uses** per visitor.
- Check by **both** `anonymousId` AND email — whichever has more uses, that's the count.
- Only `status: "success"` counts towards the limit (failed runs don't burn a use).
- Check happens server-side in the API route before any expensive work (HTML fetch or LLM call).

**UI signals:**

| State | What they see |
|-------|-------------|
| First run, results screen | "You have 2 free Signal Scores remaining" |
| Second run, results screen | "You have 1 free Signal Score remaining" |
| Third run, results screen | "This was your last free Signal Score. For a deeper analysis across all 5 elements, let's talk." |
| Fourth attempt, modal opens | Limit screen: "You've used your 3 free Signal Scores. Call Daniel to discuss a full Signal Method audit." with phone + email |

---

## 4. Data Model

### New Convex table: `signalReports`

```
signalReports:
  leadId          — id("leads"), references the lead created/updated on submission
  anonymousId     — string, for rate limiting before email is known
  url             — string, the graded website URL
  customerDescription — string, their ideal customer sentence
  overallScore    — number (0-100)
  gruntTest       — { pass: boolean, explanation: string }
  elements        — {
                      character: { score, summary, analysis, recommendation },
                      problem:   { score, summary, analysis, recommendation },
                      guide:     { score, summary, analysis, recommendation },
                      plan:      { score, summary, analysis, recommendation },
                      cta:       { score, summary, analysis, recommendation },
                      stakes:    { score, summary, analysis, recommendation },
                      transformation: { score, summary, analysis, recommendation }
                    }
  quickWin        — string (the single most impactful tip)
  strengths       — array of strings (2-3 things the site does well)
  fullSummary     — string (overall assessment paragraph)
  status          — "success" | "fetch_failed" | "llm_failed" | "rate_limited"
  accessLevel     — "locked" | "unlocked"
  createdAt       — number (timestamp)

Indexes: by_leadId, by_anonymousId, by_url, by_createdAt, by_status
```

### Updated `submitSignalScore` mutation

- Now receives email, so it creates/upserts a lead via `upsertLead` with source `"signal_score"`.
- Links the `signalReport` to the lead.
- Stores signal score data on the lead record (`signalScore`, `signalUrl`, `signalCustomer`).

### Tracking success/failure

Every API call creates a `signalReport` record regardless of outcome. The `status` field records what happened:
- `"success"` — full analysis completed
- `"fetch_failed"` — couldn't retrieve the website HTML
- `"llm_failed"` — OpenRouter call failed or response couldn't be parsed
- `"rate_limited"` — user hit the 3-use limit (recorded but no expensive work done)

This lets Daniel query `signalReports` grouped by status to see the success/failure ratio and know if the simple fetch approach is losing potential customers.

---

## 5. API Route

**`app/api/signal-score/route.ts`**

Request flow:

1. **Receive POST:** `{ url, customerDescription, firstName, email, anonymousId }`
2. **Rate limit check** — query Convex for `signalReports` with `status: "success"` by this email OR anonymousId. If >= 3, save a report with `status: "rate_limited"`, return `{ error: "rate_limited", usesRemaining: 0 }`.
3. **Fetch HTML** — server-side `fetch(url)` with a 10-second timeout and a sensible User-Agent. If it fails, save a report with `status: "fetch_failed"`, return error with message.
4. **Strip content** — remove `<script>`, `<style>`, `<nav>`, `<footer>` tags, decode entities, trim to ~3000 tokens of meaningful body content (headings, paragraphs, CTAs, image alt text).
5. **Call OpenRouter** — POST to `https://openrouter.ai/api/v1/chat/completions` with the scoring prompt and stripped HTML.
6. **Parse response** — extract the JSON structure. If parsing fails, save `status: "llm_failed"`, return error.
7. **Save to Convex** — create lead via `upsertLead` (with email + signal score data), create `signalReport` with full results and `status: "success"` and `accessLevel: "locked"`.
8. **Trigger emails** — schedule notification emails to both the visitor and Daniel.
9. **Return to client** — `{ overallScore, gruntTest, quickWin, reportId, usesRemaining }`.

**Environment variables:**
- `OPENROUTER_API_KEY` in `.env.local`
- Model: `google/gemini-2.0-flash-001` (configurable in one place)

---

## 6. LLM Prompt

The system prompt must produce thorough, honest, specific analysis that references actual content from the page. Key prompt rules:

- **Quote actual copy** from the page — specific headlines, CTAs, sections, body text.
- **Identify what they do well** — never purely negative.
- **Frame gaps as opportunities**, not criticism.
- **Be honest** — if the site is good, say so. Don't manufacture low scores.
- **Apply The Grunt Test** — can you answer the 3 questions within 5 seconds?
- **Note obvious errors** — placeholder content, broken elements, stock photos, inconsistent CTAs.
- **Factor in the prospect's stated ideal customer** when scoring Character and Problem.
- **Scoring bands:** 1-3 absent/contradicts, 4-6 partially present but weak, 7-8 present and effective, 9-10 executed exceptionally well.

The prompt will include:
- The full SB7 scoring criteria for each sub-element (based on the real audit practice documented in `docs/signal-method.md` and demonstrated in completed audits).
- The stripped HTML content of the homepage.
- The prospect's description of their ideal customer.
- The required JSON response format.

Each element's `summary` is one line. Each element's `analysis` is 2-3 detailed paragraphs referencing actual page content (matching the depth of real Dreamfree audits like the Julian Hobbs example). Each element's `recommendation` is a specific, actionable fix.

---

## 7. Content Tiers & Report Access

Four tiers of content from a single grading run:

| Tier | Content shown | Where | Who |
|------|--------------|-------|-----|
| **Instant** | Overall score ring, Grunt Test pass/fail, 1 quick win, uses remaining | Modal (results step) | Anyone who runs the grader |
| **Email** | Score recap, Grunt Test result, link to report page, nudge to register | Visitor's inbox | The person who ran it |
| **Teaser** | All 7 element scores + summaries + top 2 recommendations (from the two lowest-scoring elements) + strengths. Remaining analysis/recommendations blurred. | `/report/[id]` (signed in, email matches) | Registered user who ran it |
| **Full** | Everything — all analysis paragraphs, all 7 recommendations, full summary, Grunt Test detail | `/report/[id]` (paid or admin) | Paying user or admin |

### Funnel logic

1. Run grader -> see instant score + quick win -> "We've emailed your results"
2. Email contains link to `/report/[id]` -> "Sign up to see your element-by-element breakdown and two priority fixes"
3. Register with Clerk (same email) -> see teaser tier -> below the two recommendations: "Unlock your full Signal Report" paywall CTA
4. Admin sees everything, no restrictions

---

## 8. Report Page (`/report/[id]`)

**Route:** `/report/[id]` where `id` is the Convex document ID.

**Layout:** Clean, single-column, matches site design.

**Sections:**
1. **Header** — "Signal Score Report" + graded URL + date
2. **Score ring** — Animated ring with overall score
3. **Grunt Test** — Pass/fail badge with explanation
4. **Strengths** — 2-3 things the site does well
5. **Element breakdown** — 7 cards, each with score bar + summary. Teaser: two lowest-scoring elements show full recommendation. Other 5 blurred with lock icon.
6. **Detailed analysis** — Full paragraphs per element. Blurred for teaser. Visible for paid/admin.
7. **Paywall CTA** — "Unlock your full Signal Report — detailed analysis for every element, all recommendations, and a messaging blueprint." Placeholder button (no payment gateway yet — Daniel can manually flip `accessLevel` to `"unlocked"` in Convex dashboard).
8. **Footer CTA** — "Want someone to fix this for you? Talk to Daniel." with phone + email.

**Access logic (server-side):**

```
No Clerk session                           -> redirect to sign-in (return URL = /report/[id])
Signed in, admin (Daniel's email)          -> render full report
Signed in, email matches, unlocked         -> render full report
Signed in, email matches, locked           -> render teaser
Signed in, email doesn't match             -> 404
```

---

## 9. Email Notifications

**Email to the visitor** (via Resend):
- Subject: `"{firstName}, your Signal Score is {score}/100"`
- Body: Brief recap of score, Grunt Test result, link to `/report/[id]`
- CTA: "See your element-by-element breakdown" (requires sign-up)
- Tone: Helpful, consultative, not salesy

**Email to Daniel** (via Resend):
- Subject: `"New Signal Score: {url} — {score}/100"`
- Body: Name, email, URL, customer description, overall score, 7 element scores
- Immediate visibility into every lead without checking the dashboard

---

## 10. Files to Create/Modify

### New files
- `app/api/signal-score/route.ts` — API route (fetch, strip, LLM call, save)
- `app/report/[id]/page.tsx` — Report page with tiered access
- `convex/signalReports.ts` — New table mutations/queries
- `lib/signal-prompt.ts` — The LLM system prompt (kept separate for easy iteration)
- `lib/html-stripper.ts` — HTML to meaningful content extraction
- `components/report/ScoreRing.tsx` — Reusable score ring (extracted from SignalFlow)
- `components/report/ElementCard.tsx` — Score card for each element
- `components/report/GruntTestBadge.tsx` — Pass/fail badge
- `components/report/PaywallOverlay.tsx` — Blur + unlock CTA overlay

### Modified files
- `convex/schema.ts` — Add `signalReports` table
- `convex/formSubmissions.ts` — Update `submitSignalScore` to create leads with email
- `components/signal-flow/SignalFlow.tsx` — New Step 3 (name + email), real API call, uses remaining display, limit screen
- `.env.local.example` — Add `OPENROUTER_API_KEY`

---

## 11. What's NOT in Scope

- Payment gateway integration (manual unlock via Convex dashboard for now)
- Scoring the other 4 Signal Method elements (Design, Direction, Diagnosis, Measurement)
- Multi-page analysis (homepage only)
- Visual/design assessment (text content only — no screenshot analysis)
- Follow-up email sequences (future work, tables already exist in schema)
