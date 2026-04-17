# Pricing page — design spec

**Date:** 2026-04-17
**Status:** Approved, ready for implementation plan
**URL:** `/pricing`
**Owner:** Daniel (reviews) / Claude (implements)

---

## Purpose

Publish Dreamfree's real pricing on a single conversion-focused page. This is the **first piece of TAYA (They Ask, You Answer) content** in the SEO rebuild laid out in `mission-control/docs/seo/dreamfree-seo-log.md`. It is the highest-commercial-intent buyer destination — the page someone visits right before deciding to book or leave.

### Why a pricing page, why now

GSC review (2026-04-17 baseline) showed Dreamfree ranks for zero buyer-intent queries. Every ranking query is marketing theory (`subheads`, `referral marketing`, etc.) attracting researchers, not buyers. The fix is to publish content that answers what buyers actually Google. Pricing is the single highest-intent piece — someone searching for `website design pricing uk` is materially closer to purchase than someone searching for `content marketing ideas`.

### Success criteria

1. **Ranking signal** — `/pricing` appears in GSC impressions within 3 weeks of publish, earning impressions on queries containing `price`, `cost`, `£`, or `subscription`.
2. **Conversion signal** — at least one demo request or call booking attributed to `/pricing` traffic in the first 30 days after launch.
3. **Topic cluster signal** — the three existing cost articles in `/learning-centre` start receiving increased referral traffic from `/pricing` (visible in Clarity referring URL data).

---

## Pricing decisions (the anchors)

These are locked (see `memory/dreamfree_pricing_model.md` for rationale):

| Anchor | Value | Notes |
|---|---|---|
| **Upfront build** | "Websites from £5,000" | Single-number anchor. Range context: "Most £8k–£12k · Flagship £20k+". |
| **Monthly managed service** | "from £149/month" | Floor raised from historical £79 on 2026-04-17. **Do NOT reference the £79 → £149 change on-page.** |
| **Custom tools** | Quoted separately | Booking systems, loyalty, compliance, etc. — own project fee + own ongoing monthly. |

### Explicitly rejected approaches (do not propose in copy or revision)

- **Fake fixed tiers** ("Starter £197 / Pro £297") — not backed by real client purchases.
- **Quote-only / hidden pricing** — undermines TAYA thesis and SEO.
- **Interactive price calculator** — recreates the fake-tiers problem by implying precise combinations.

---

## Voice and tone

Three rules applying to every block of copy:

1. **Plain numbers, plain English.** No "investment", no "bespoke solutions", no "starting from just". If it's £149/month, write £149/month. If most builds land £8–12k, say so.
2. **Name the uncomfortable parts out loud.** Acknowledge sub-£5k budgets aren't a fit. Acknowledge most agencies build-and-disappear. Acknowledge what *isn't* included.
3. **Outcomes, not line items.** The monthly section talks about *"I want leads followed up automatically"*, not *"CRM integration package"*.

**Voice calibration:** Daniel Priestley / Marcus Sheridan end of the spectrum — direct, founder-voice, one-person-wrote-this. Short paragraphs (2-3 sentences max). Lots of whitespace. One clear thought per block.

---

## Page architecture

Blocks in order. The page flows anchor → trust → explanation → objection handling → CTA.

### 1. Hero

- `<PageHero>`-equivalent with integrated dual anchor cards (instead of the single-heading format `/services` uses).
- H1: "Website pricing. In numbers, not ranges." (final wording in implementation plan; this captures the direction.)
- Subtitle (~1 sentence): honest-numbers framing.
- Dual anchor cards, side-by-side desktop, stacked mobile:
  - "The build — from £5,000" + "Most £8k–£12k. Flagship £20k+."
  - "The monthly — from £149" + "Scales with what your website needs to do."
- Dual CTA immediately beneath: **primary** `Get a Free Demo` button, **secondary** small "Prefer to chat? Book a 30-min call" text link.

### 2. "Why we publish real numbers"

- 3-4 short lines.
- Acknowledges most agencies hide prices and explains why Dreamfree doesn't.
- TAYA-style trust-builder. Filters wrong-fit prospects early.

### 3. The build: £5,000 starting point

- Single anchor, not multiple tiers.
- What £5k gets you — the Signal Method foundation (list the core deliverables).
- What pushes builds to £10k / £15k / £25k+ — premium design, strategy depth, CRM, custom tools, AI integrations.
- Range paragraph: "Most builds land £8k–£12k. Flagship £20k+."
- Outbound link: `/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000` as "Read the full breakdown of what drives website prices up".

### 4. The monthly: starts at £149, scales with outcomes

- Base bullet: what £149 always includes (hosting, security, maintenance, break-fix support, 1 free mini update per month up to 30 mins).
- `<OutcomeRow>` list — each row is a plain-English outcome the client might want, with a brief explainer and a small range added to the monthly. Memory lists these four as the core set:
  1. "I want leads followed up automatically" — CRM + automations.
  2. "I want to be found on Google" — SEO strategy.
  3. "I want to know what's working" — analytics + reporting.
  4. "I need a custom tool on top of the website" — custom tool + its own maintenance allocation.
- Ranges used for the added amounts — exact figures per outcome are not published (consistent with memory rule: "transparent about ranges without publishing exact figures for every permutation"). Specific ranges finalised in the implementation plan.

### 5. "What you won't pay for"

- One-paragraph trust block.
- Call out: no hidden setup fees, no DNS/SSL/plugin surprises, no build-and-disappear. Explicit contrast with industry norm.
- Example direction (not final copy): *"Most agencies hand you a login and disappear. We don't. Your fee is what keeps us as your ongoing technical partner — handling the things you shouldn't have to learn."*

### 6. "Learn more about website pricing"

- 3-card block, one per existing cost article:
  - `/learning-centre/how-much-does-a-business-website-cost-uk`
  - `/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about`
  - `/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000`
- Makes `/pricing` the hub of the cost topic cluster for SEO.
- Card format can reuse an existing card pattern from elsewhere on the site (check `/learning-centre/page.tsx` for the canonical pattern during implementation).

### 7. FAQ (5-8 questions)

- Native `<details>`/`<summary>` HTML accordion — no JS, no component library. Accessible, SEO-crawlable.
- Questions must address the awkward stuff, not the easy stuff:
  - Why no fixed tiers?
  - Can I see real past projects and what they cost?
  - What if my budget's under £5,000?
  - Do you offer payment plans?
  - Do I own my website?
  - Can I cancel the monthly? What happens to my site if I do?
  - What counts as a "mini update"?
  - Do I need the monthly if I just want a one-off build?
- Final question list is finalised in the implementation plan based on what's actually defensible.

### 8. Final CTA

- `<FinalCta>` component or equivalent — reframe the CTA text slightly versus hero so it doesn't feel repetitive.
- Hero: "Get a Free Demo" → Final: "See your demo before you decide" (direction, not final copy).
- "Prefer to chat first? Book a 30-min call" secondary link retained.

---

## Components

### New

| Component | Purpose | Props |
|---|---|---|
| `<PriceAnchorCard>` | Reusable two-up anchor card used in hero | `kicker`, `figure`, `unit`, `rangeNote` |
| `<OutcomeRow>` | Row for the "what grows the monthly" list | `outcome`, `what`, `addsMonthly` |

Both live under `components/pricing/`.

### Reused (no changes)

- `<PageHero>` — if compatible with the dual-card treatment, reuse; else the hero is a one-off composition on the page. **Decision: implement as a one-off composition on the page** — `PageHero` is single-column and modifying it risks regressing `/services`, `/about`, `/contact`.
- `<FinalCta>` — final block.
- `<Button variant="main">` — CTAs.
- `buildMetadata` — page meta.
- `serviceSchema` (or equivalent helper in `lib/structured-data.ts`) — extended to emit an `Offer` schema. If the helper doesn't cover `Offer` yet, add it in the same change.
- Existing design tokens — cream/teal/charcoal, `clamp()` type scale, `[data-reveal]`, the "kicker + italic-serif heading" pattern.

### Not adding

- No new animation/motion library.
- No new colour tokens.
- No new icon set.

---

## Data flow

Static page. No runtime data fetches. All copy, numbers, and outcome rows are hard-coded in the page file or the new components. The FAQ is hard-coded HTML.

### What updates triggers a code change (not a CMS update)

Any price change. This is intentional — pricing should not be casually edited. Code review + commit + deploy is the right friction level.

---

## SEO

### Target query cluster

| Priority | Query |
|---|---|
| Primary | `website design pricing uk` / `website pricing uk` |
| Secondary | `small business website cost`, `how much is a website uk`, `website subscription pricing uk` |
| Not on this page | Anything location-specific (`website design hertfordshire` etc.) — belongs on Phase 3 location pages. |

### On-page metadata

| Element | Content |
|---|---|
| URL | `https://dreamfree.co.uk/pricing` |
| `<title>` | "Website Pricing — From £5,000 + £149/month · Dreamfree" (~60 chars, numbers in title for CTR) |
| Meta description | "Transparent website pricing. Builds from £5,000. Managed service from £149/month, scaling with what your website actually needs to do. No hidden setup fees, no contracts." |
| Canonical | `https://dreamfree.co.uk/pricing` |
| `<h1>` | Direction: "Website pricing. In numbers, not ranges." (exact in implementation plan.) |

### Structured data

Two JSON-LD blocks in the page, using the existing `structured-data.ts` pattern:

1. **`Offer`** schema on the build anchor — `priceCurrency: "GBP"`, `price: "5000"`, `priceValidUntil`, `availability`, linked to a `Service` entity.
2. **`FAQPage`** schema on the FAQ block — each Q/A pair.

If `lib/structured-data.ts` doesn't currently expose an `Offer` or `FAQPage` helper, add it in the same change.

### Internal links (required for crawl prioritisation)

Add inbound links to `/pricing` from:

- `/services` — inside the "Website Management" service card.
- `/` (homepage) — at minimum the footer; ideally a primary-nav item if that doesn't conflict with site IA.
- Each of the three cost articles in `/learning-centre`.

Without these, `/pricing` gets crawled as an orphan and deprioritised.

### Sitemap + indexing

- Confirm `app/sitemap.ts` includes `/pricing` after publish. If the sitemap is driven from filesystem routes, this is automatic; if driven from a manual list, update it.
- Request indexing for `/pricing` via GSC URL Inspection on publish (this is a manual step for Daniel — no API).

---

## Measurement

These checks are added to `mission-control/docs/seo/dreamfree-seo-log.md` in the "Next SEO review" checklist when this ships.

1. **GSC impressions** — `/pricing` receives impressions within 3 weeks of publish.
2. **Buyer-intent query share** — GSC queries for `/pricing` include any of `price`, `cost`, `£`, `subscription`, `pricing`. Baseline for the whole site today: 0%.
3. **Conversion attribution** — demo requests or call bookings where `/pricing` was the landing or previous page (GA4 event attribution; Clarity referring-page data as backup).
4. **Cost-cluster referrals** — the three existing cost articles start receiving visits referred from `/pricing` (Clarity referring URL data).

---

## Out of scope (deliberately not in this spec)

- Case-study links / testimonial block on `/pricing` itself — covered elsewhere sitewide by `FinalCta`.
- Comparison-to-competitors (Wix, Squarespace, other agencies) — belongs on a dedicated comparison article (Phase 2, later piece).
- Payment plans copy beyond "yes/no" in the FAQ — if payment plans are offered, full details live on a separate `/payment-plans` page, not buried on `/pricing`.
- Niche-specific pricing (e.g., "vet website pricing") — belongs on Phase 3 niche landing pages.
- Rewriting the 3 existing cost articles — they stay as-is for now; the spec only requires we link to them.

---

## Open questions for implementation

These are for the implementation plan to resolve, not the spec:

1. **Exact ranges added to the monthly per outcome** — e.g., "CRM + automations +£X/mo". Daniel to supply or approve during implementation.
2. **Final H1 and hero subtitle wording** — direction is set; exact words land in implementation.
3. **Final FAQ question list and answers** — 5-8 defensible Q/A pairs; Daniel to approve.
4. **Whether `/pricing` goes in the primary nav** — this is a global IA decision affecting `Header.tsx`; confirm with Daniel before shipping.

---

## Sources and references

- Strategy: `mission-control/docs/seo/dreamfree-seo-log.md`
- Baseline GSC data: `mission-control/docs/seo/baselines/2026-04-17-gsc-baseline.json`
- Pricing model memory: `~/.claude/projects/C--Users-Danny-AutoProspect/memory/dreamfree_pricing_model.md`
- Existing cost articles:
  - `content/learning-centre/how-much-does-a-business-website-cost-uk.mdx`
  - `content/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about.mdx`
  - `content/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000.mdx`
- Existing services page (design language reference): `app/services/page.tsx`
