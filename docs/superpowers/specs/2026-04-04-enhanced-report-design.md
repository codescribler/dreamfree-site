# Enhanced Signal Score Report — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Goal

Transform the Signal Score report from a data display into a narrative-driven sales tool. The report must deliver real value to busy business owners while making it clear that their score directly impacts their bottom line — and that Dreamfree can fix it.

## Key Principles

- Every section explains **why it matters** in business terms (lost leads, missed revenue)
- The public tier teases enough to compel email verification
- The verified tier follows a narrative arc: Problem → Solution → Confidence → CTA
- Recommendations are specific, actionable, and demonstrate expertise
- The primary conversion action (request a callback) is as frictionless as possible

---

## Public Tier (Above Email Gate)

Visitors see enough to understand their score matters and want the full picture.

### 1. Score Ring + Business Context

The score ring remains as-is visually. Below it, add a context line:

> "Your Signal Score predicts how effectively your website turns visitors into customers. The higher your score, the more leads your site generates."

For low scores (below 50), add urgency:

> "A score of {score} means your website is likely losing the majority of potential customers before they ever get in touch."

For mid scores (50-70):

> "A score of {score} means your website is converting some visitors, but there's significant room to capture more leads."

For high scores (70+):

> "A score of {score} means your website communicates well — but there are still opportunities to sharpen your message and win more business."

### 2. Grunt Test Badge

As now — pass/fail with explanation. No changes needed.

### 3. Quick Win

As now — one free, specific recommendation. Proves the analysis is real and tailored to their site.

### 4. Element Scores Preview

Show all 7 element cards with:
- Element name
- Score (X/10) with colour-coded bar
- Summary line (one sentence)

**Analysis and recommendations are hidden** behind a blurred overlay. Below the preview grid, a clear message:

> "Unlock your 7 personalised recommendations — tailored specifically to {url}"

### 5. Email Gate

VerifyPrompt as now — 6-digit code or magic link. The CTA text on the gate should reinforce value:

> "Enter your code to see what's costing you customers — and exactly how to fix it."

---

## Verified Tier (Narrative Flow)

Once unlocked, the report follows a deliberate arc designed to build urgency, deliver value, and convert.

### 1. Context Intro

A short framing paragraph at the top of the unlocked content:

> "Below is your full Signal Score breakdown. Each element measures a specific part of how your website communicates to potential customers — and directly affects whether visitors become paying clients. We've analysed your site against The Signal Method framework and identified exactly where you're losing leads and how to fix it."

### 2. "What's Costing You Customers"

**Elements scoring 6 or below**, ordered lowest score first (worst problems first).

Each card shows:
- Element name + score bar (colour-coded)
- **"Why this matters"** — a one-line business impact statement. Examples:
  - Character 4/10: "If visitors can't tell who your site is for within 5 seconds, they leave."
  - Problem 3/10: "If you don't articulate the problem you solve, visitors won't see the need to buy."
  - CTA 5/10: "Without a clear call to action, visitors who want to buy don't know how."
- **Detailed analysis** — the full analysis text explaining what's wrong, referencing specific content from their site

Section header: **"What's costing you customers"**

If no elements score 6 or below, this section is omitted and the narrative adjusts.

### 3. "Your Personalised Action Plan"

**1-3 recommendations per weak element** (scoring 6 or below), in the same order as section 2.

Each element gets its own card:
- Element name as header
- Numbered list of 1-3 recommendations
- Each recommendation is specific and actionable (references their actual site content)

Rules for recommendations:
- **Minimum 1** per element, always
- **2-3** only if they would add real, distinct value — not padding
- **Maximum 3** per element
- Each recommendation should be something a business owner reads and thinks "yes, that makes sense, I should do that"

Section header: **"Your personalised action plan"**

### 4. "What You're Doing Well"

**Elements scoring 7 or above.**

Lighter treatment than the problem cards:
- Element name + score bar
- Summary line
- Brief "keep doing this" note (from the analysis, highlighting what's working)

Section header: **"What you're doing well"**

If no elements score 7+, this section is omitted.

### 5. Overall Assessment

The `fullSummary` paragraph, positioned as a wrap-up that ties the findings together.

### 6. Primary CTA — Request a Report Review Call

Header: **"Want someone to fix this for you?"**

Supporting text:

> "Daniel can walk you through your report and show you what your site could look like with these changes applied. Book a free 15-minute report review call — no obligation, no pressure."

**Button:** "Request a Free Report Review Call"

**On click:** Modal/popup with:
- Phone number field, **pre-filled** from the phone number they entered in the Signal Score form
- Message: "Is this the best number to contact you on?"
- The field is editable
- Submit button: "Request Call"
- On submit: saves the callback request and sends Daniel a notification email with name, email, phone, website URL, and report link

### 7. Secondary CTA

Below the primary CTA, smaller treatment:

> "Or call Daniel directly — {phone number}"
> "Email Daniel — {email}"

As now, but visually secondary to the callback request.

---

## Data Changes

### Schema: `convex/schema.ts`

**signalReports table:**
- Change `recommendation: string` to `recommendations: v.array(v.string())` in each element object (1-3 items per element)

**leads table:**
- Add `phone: v.optional(v.string())` field

**New table: `callbackRequests`**
```
callbackRequests: defineTable({
  leadId: v.id("leads"),
  reportId: v.id("signalReports"),
  phone: v.string(),
  status: v.union(v.literal("pending"), v.literal("contacted"), v.literal("closed")),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_createdAt", ["createdAt"])
```

### Signal Score Form

Add a **phone number** field to step 2 of the SignalFlow form (alongside name and email). Optional but encouraged. Stored on the lead record.

### LLM Prompt Changes (`lib/signal-prompt.ts`)

1. **Model:** Change primary model to `qwen/qwen3.6-plus:free` with fallback to `google/gemini-2.0-flash-001`
2. **Recommendation format:** Update the prompt to request 1-3 recommendations per element as an array instead of a single string
3. **"Why this matters" lines:** Add instruction to generate a one-line business impact statement per element (new field: `businessImpact`)
4. **Response schema update:**

```json
{
  "elements": {
    "[element_name]": {
      "score": 1-10,
      "summary": "one-liner",
      "analysis": "2-3 detailed paragraphs",
      "businessImpact": "one-line statement about why this score costs them business",
      "recommendations": ["specific fix 1", "specific fix 2 (only if adds real value)"]
    }
  }
}
```

### API Route Changes (`app/api/signal-score/route.ts`)

- Accept `phone` in the request body
- Store phone on the lead record
- Model fallback logic: try Qwen3.6 Plus first, if the request fails (model unavailable / error), retry with Gemini Flash

### New Convex Mutations

- `callbackRequests.create` — saves the callback request
- Update to `emails.ts` — new `sendCallbackNotification` action that emails Daniel when a callback is requested

### Existing Data

This is a clean break — existing report documents in the dev Convex database will need to be deleted or patched to match the new schema (single `recommendation` string → `recommendations` array, add `businessImpact` field). Since this is dev only, deleting existing reports is acceptable.

---

## What Stays the Same

- Email verification flow (6-digit code + magic link)
- Cookie and Clerk access system
- Rate limiting (3 reports per user)
- Admin bypass for daniel@dreamfree.co.uk
- ScoreRing, GruntTestBadge components (visual treatment unchanged)
- Email templates (visitor + admin notification) — content unchanged beyond what was already updated
- VerifyPrompt component (functional behaviour unchanged, CTA text updated)

---

## Component Structure

### New Components
- `components/report/BusinessImpactCard.tsx` — element card for the "costing you customers" section (score bar + businessImpact + analysis)
- `components/report/ActionPlanCard.tsx` — element card for the "how to fix it" section (numbered recommendations list)
- `components/report/StrengthCard.tsx` — lighter element card for the "doing well" section (score bar + summary + keep-doing-this note)
- `components/report/CallbackModal.tsx` — phone confirmation popup for the CTA
- `components/report/ScoreContext.tsx` — the contextual message below the score ring (adapts by score range)
- `components/report/ElementPreview.tsx` — public tier element preview with blurred overlay

### Modified Components
- `components/report/ElementCard.tsx` — may be removed or refactored, replaced by the three new card types above
- `components/signal-flow/SignalFlow.tsx` — add phone field to step 2

### Modified Pages
- `app/report/[id]/page.tsx` — restructure to narrative flow, add new sections, wire up new components

---

## Score Threshold Summary

| Score | Classification | Appears in |
|---|---|---|
| 0-6 | Weak | "What's costing you customers" + "Your personalised action plan" |
| 7-10 | Strong | "What you're doing well" |

If all elements score 7+, the "costing you" and "action plan" sections are omitted and the report leads with strengths + overall assessment.

If all elements score 6 or below, the "doing well" section is omitted.
