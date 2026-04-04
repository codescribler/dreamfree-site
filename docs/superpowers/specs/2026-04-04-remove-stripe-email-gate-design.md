# Remove Stripe Payment — Email-Only Access Gate

**Date:** 2026-04-04
**Status:** Approved

## Summary

Replace the three-tier access model (public / verified / paid) with a two-tier model (public / verified). The cost of seeing the full Signal Score report is the user's email address — no payment required. This refocuses the product on lead generation rather than monetisation.

## Current State

Three access tiers:
- **Public** — score ring, grunt test badge, quick win
- **Verified** (email gate) — + strengths, element scores & summaries
- **Paid** (Stripe £7/£27) — + detailed analysis, recommendations, full assessment

## Target State

Two access tiers:
- **Public** — score ring, grunt test badge, quick win
- **Verified** (email gate) — everything: strengths, element scores, summaries, detailed analysis, recommendations, full assessment

Account creation remains optional after verification (unchanged flow, just triggered after verification instead of after payment).

## Changes

### Delete

| File | Reason |
|------|--------|
| `app/api/report/[id]/checkout/route.ts` | Stripe checkout endpoint |
| `app/api/webhooks/stripe/route.ts` | Stripe webhook handler |
| `components/report/BuyPrompt.tsx` | Payment CTA component |

### Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Remove `"paid"` from `accessLevel` union; remove `stripeSessionId`, `paidAmount`, `paidAt`, `firstViewedAt` fields |
| `convex/signalReports.ts` | Remove `markPaid` mutation; remove `firstViewedAt` recording logic |
| `app/report/[id]/page.tsx` | Collapse paid tier into verified — verified users see all content; show `CreateAccountPrompt` after verification (not after payment); remove paid-tier checks and Stripe-related query params |
| `components/report/ElementCard.tsx` | Verified users see full analysis + recommendations; remove blurred/locked state |
| `app/api/report/[id]/create-account/route.ts` | Change access guard from `accessLevel === "paid"` to `accessLevel === "verified"` |
| `package.json` | Remove `stripe` dependency |
| `.env.local.example` | Remove `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_EARLY`, `STRIPE_PRICE_STANDARD` |

### Unchanged

- Email verification flow (6-digit code + magic link)
- Cookie signing and persistence (`lib/report-cookie.ts`)
- Admin bypass (`daniel@dreamfree.co.uk`)
- Rate limiting (3 reports per user)
- Report generation and scoring
- Clerk authentication integration
- Email templates (`convex/emails.ts`)

## Data Migration

No migration needed — no existing reports have `accessLevel: "paid"`. The `"paid"` value can be dropped from the schema without risk.

## Risk

Low. This is a removal of functionality with no data migration concerns. The verification and cookie flows are untouched.
