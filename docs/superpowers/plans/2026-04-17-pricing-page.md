# Pricing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pricing` — the first TAYA (They Ask, You Answer) conversion page of the SEO rebuild, with transparent anchors (Websites from £5,000 / from £149/month), outcome-based monthly scaling, dual CTA, and internal links that make it the hub of the cost topic cluster.

**Architecture:** Single Next.js App Router page at `app/pricing/page.tsx` composed from existing primitives plus two new small components (`PriceAnchorCard`, `OutcomeRow`). Two schema helpers (`offerSchema`, `faqPageSchema`) added to `lib/structured-data.ts`. Inbound internal links added from `/services`, footer (via `NAV_LINKS`), and three cost articles. Static rendering, no runtime fetches.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS (existing design tokens: cream/teal/charcoal). No test framework — verification via `next build`, `next lint`, `prebuild` content validator, and manual browser check.

**Spec:** `docs/superpowers/specs/2026-04-17-pricing-page-design.md`

---

## File Structure

| File | New/Modified | Purpose |
|---|---|---|
| `lib/structured-data.ts` | Modified | Add `offerSchema()` and `faqPageSchema()` helpers |
| `components/pricing/PriceAnchorCard.tsx` | Create | Reusable anchor card (kicker + figure + unit + range note) |
| `components/pricing/OutcomeRow.tsx` | Create | Row format for "what grows the monthly" list |
| `app/pricing/page.tsx` | Create | The pricing page itself |
| `app/sitemap.ts` | Modified | Add `/pricing` to static pages (priority 0.9) |
| `lib/constants.ts` | Modified (conditional on Task 6) | Add `/pricing` to `NAV_LINKS` if Daniel opts in |
| `app/services/page.tsx` | Modified | Add link to `/pricing` in Website Management service card |
| `content/learning-centre/how-much-does-a-business-website-cost-uk.mdx` | Modified | Add link to `/pricing` in body |
| `content/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about.mdx` | Modified | Add link to `/pricing` in body |
| `content/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000.mdx` | Modified | Add link to `/pricing` in body |
| `mission-control/docs/seo/dreamfree-seo-log.md` | Modified | Log the launch under "Actions log" |

---

## Draft copy (Daniel to approve inline before execution)

**This entire block is Daniel's content review. Edit in place. Nothing ships until it reads right.**

### Hero

- Kicker: **Real pricing, published openly**
- H1: **Websites from £5,000. Managed from £149 a month.**
- Subtitle: *No fake tiers. No "Request a quote". No contract surprises. This is what it actually costs to build and keep a website with Dreamfree.*
- Primary CTA: **Get a Free Demo** (existing `data-modal="signal-flow"` or link to `/free-demo` — confirm in Task 4)
- Secondary CTA: small text link — *Prefer to chat first? Book a 30-minute call* → `/contact`

### "Why we publish real numbers" (Section 2 — ~3 short paragraphs)

> Most agencies won't publish their prices. They'd rather get you on a sales call first — where they can figure out your budget and price just below it.
>
> We think that's backwards. If you're researching what a website costs, you should be able to find the answer in sixty seconds. So here it is, in detail: what Dreamfree charges, why it varies, and what happens when a project is bigger or smaller than average.
>
> If our numbers are wrong for your business, you'll know before you book a call. That saves both of us time.

### The build: £5,000 starting point (Section 3)

Lead line: *"The starting point is £5,000. Here's what that gets you — and what takes it higher."*

**What £5,000 gets you:**
- Full Signal Method website — seven pillars designed to cut through noise and drive enquiries
- Homepage plus up to five core pages (e.g. About, Services, Contact, and two you choose)
- Clear messaging built from the Signal Method audit
- Mobile-first responsive design, hosted on fast modern infrastructure
- Handover including analytics setup and a walkthrough of everything you need to know

**What pushes the build higher:**
- Premium design direction (photography, custom illustration, brand refresh) — typical **+£2,000–£5,000**
- Larger site (10+ pages, landing pages, location pages) — typical **+£1,500–£4,000**
- CRM + lead follow-up automation built in at launch — typical **+£1,500–£3,000**
- AI integrations (content generators, chat, lead routing) — typical **+£2,000–£6,000**
- Custom tools (booking systems, loyalty platforms, compliance tools) — priced per project, typical **£3,000–£15,000**

Range paragraph: *"Most Signal Method builds land between £8,000 and £12,000. Flagship projects with custom tools reach £20,000 or more."*

Learn-more link: *→ Read the full breakdown of what drives website prices up* (`/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000`)

### The monthly: from £149, scales with outcomes (Section 4)

Lead line: *"Every client starts at £149 a month. The fee grows when your website needs to do more."*

**What £149/month always includes:**
- Hosting, security, and daily backups
- Maintenance and plugin/framework updates
- Break-fix support — if something breaks, we fix it
- One free mini update a month (up to 30 minutes, normally £70)
- You never deal with DNS, SSL, plugin conflicts, or hosting support tickets

**What adds to the monthly (pick what matches how you want your site to work):**

| Outcome | What it is | Adds |
|---|---|---|
| *"I want leads captured and followed up automatically"* | CRM integration + email/SMS follow-up automations, triggered when someone enquires | **+£30–£60/mo** |
| *"I want to be found on Google"* | Ongoing SEO — keyword tracking, content updates, Google Business Profile optimisation, quarterly technical audit | **+£80–£200/mo** |
| *"I want to know what's working"* | Analytics setup, monthly reporting, conversion tracking on forms and calls — plain-English, not a metrics dump | **+£40–£80/mo** |
| *"I need a custom tool maintained alongside the website"* | Ongoing maintenance, support, and feature updates for bespoke software (booking systems, loyalty platforms, compliance tools, etc.) | **+£50–£150/mo per tool** |

Closing line: *"Most clients land between £149 and £300/month. Add a custom tool and you'll be higher."*

> **ACTION FOR DANIEL:** confirm ranges above are defensible. These ranges are drafted from the memory's four outcome categories. If any range is wrong, edit before execution.

### What you won't pay for (Section 5)

> Most agencies hand you a login and disappear. You end up chasing them when WordPress updates break your site, or paying a freelancer £80 an hour who's never seen it before. That's the industry norm — and it's why most small business websites rot.
>
> Your monthly fee is what keeps Dreamfree as your ongoing technical partner. You never deal with DNS, SSL, hosting support, plugin conflicts, or "the developer's moved on". If something breaks, it's our problem to fix. If something small needs changing, it's included. You stay focused on your business; we stay focused on your website.

### Learn more (Section 6 — 3 cards)

Heading: *"Read more on website pricing"*

Three cards, one per article:
- **How much does a business website cost in the UK?** — `/learning-centre/how-much-does-a-business-website-cost-uk`
- **The hidden costs of a website nobody tells you about** — `/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about`
- **Why some web designers charge £500 and others charge £25,000** — `/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000`

### FAQ (Section 7 — 7 questions)

**Q1. Why don't you have fixed tiers?**
Because no two small businesses need the same thing. A single-location dental practice and a multi-branch estate agent both want a website, but the work to make each one effective is completely different. Fixed tiers force you to either overpay for features you don't need or underspec and end up with a site that doesn't do its job. Outcome-based pricing matches the fee to what your website actually has to do.

**Q2. Can I see real past projects and what they cost?**
Yes. Ask on a call and we'll show you the full range — what the client paid upfront, what they pay monthly, what the site does for them. Most land in the £5,000–£15,000 build bracket with monthly fees between £149 and £300.

**Q3. What if my budget is under £5,000?**
Then Dreamfree isn't the right fit, and we'll say so before wasting your time. For smaller budgets we'd point you at Squarespace or Webflow with a one-off design done by a junior freelancer — honest recommendations are the only way to build trust. If your budget grows in six months, come back.

**Q4. Do you offer payment plans for the upfront fee?**
Yes. Typically we split the build fee into three stages: 50% on kick-off, 25% at design sign-off, 25% on launch. For flagship projects we'll discuss longer payment schedules.

**Q5. Do I own my website?**
Completely. The code, the design, the content, the domain — all yours. If you ever decide to leave Dreamfree, you take the site with you and we hand over credentials and documentation.

**Q6. Can I cancel the monthly? What happens to my site if I do?**
Yes. No long contracts — one month's notice. If you cancel, you own everything and we help you move the site to whatever hosting/management you choose. We'll hand it over cleanly.

**Q7. What counts as a "mini update"?**
Up to 30 minutes of work — typically swapping out a photo, updating opening hours, adding a new team member, changing a headline. Anything bigger we'll quote before doing. Mini updates don't roll over month-to-month.

### Final CTA (Section 8)

Heading: *"See your demo before you decide."*
Subtitle: *"We'll build you a working homepage — completely free — so you can see what a Signal Method site looks like for your business before any money changes hands."*
Primary: **Get a Free Demo** (same action as hero)
Secondary link: *Prefer to chat first? Book a 30-minute call* → `/contact`

---

## Tasks

### Task 1: Add `offerSchema` and `faqPageSchema` helpers

**Files:**
- Modify: `lib/structured-data.ts` (append two new exported functions)

- [ ] **Step 1: Add `offerSchema()` function at the bottom of `lib/structured-data.ts`**

Append to `lib/structured-data.ts`:

```typescript
export function offerSchema({
  name,
  description,
  price,
  url,
}: {
  name: string;
  description: string;
  price: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    name,
    description,
    price,
    priceCurrency: "GBP",
    availability: "https://schema.org/InStock",
    url,
    seller: {
      "@type": "Organization",
      name: SITE.name,
    },
  };
}
```

- [ ] **Step 2: Add `faqPageSchema()` function directly after `offerSchema`**

Append to `lib/structured-data.ts`:

```typescript
export function faqPageSchema(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/structured-data.ts
git commit -m "feat(schema): add offer and FAQPage schema helpers"
```

---

### Task 2: Create `PriceAnchorCard` component

**Files:**
- Create: `components/pricing/PriceAnchorCard.tsx`

- [ ] **Step 1: Create the component file**

Create `components/pricing/PriceAnchorCard.tsx`:

```tsx
interface PriceAnchorCardProps {
  kicker: string;
  figure: string;
  unit: string;
  rangeNote: string;
}

export function PriceAnchorCard({
  kicker,
  figure,
  unit,
  rangeNote,
}: PriceAnchorCardProps) {
  return (
    <div
      className="rounded-3xl border border-border bg-white/70 p-8 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_32px_rgba(16,24,40,0.06)] backdrop-blur-sm"
      data-reveal
    >
      <div className="mb-3 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-teal">
        {kicker}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[clamp(2.5rem,6vw,4rem)] font-extrabold tracking-tighter text-charcoal">
          {figure}
        </span>
        <span className="text-[1rem] font-medium text-slate">{unit}</span>
      </div>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
        {rangeNote}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/pricing/PriceAnchorCard.tsx
git commit -m "feat(pricing): add PriceAnchorCard component"
```

---

### Task 3: Create `OutcomeRow` component

**Files:**
- Create: `components/pricing/OutcomeRow.tsx`

- [ ] **Step 1: Create the component file**

Create `components/pricing/OutcomeRow.tsx`:

```tsx
interface OutcomeRowProps {
  outcome: string;
  what: string;
  addsMonthly: string;
}

export function OutcomeRow({ outcome, what, addsMonthly }: OutcomeRowProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 border-b border-border py-6 last:border-b-0 md:grid-cols-[1.3fr_1fr_auto] md:items-start md:gap-6"
      data-reveal
    >
      <div className="text-[1.05rem] font-semibold italic text-charcoal">
        &ldquo;{outcome}&rdquo;
      </div>
      <p className="text-[0.95rem] leading-relaxed text-slate">{what}</p>
      <div className="text-[0.95rem] font-semibold whitespace-nowrap text-teal md:text-right">
        {addsMonthly}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/pricing/OutcomeRow.tsx
git commit -m "feat(pricing): add OutcomeRow component"
```

---

### Task 4: Create the `/pricing` page

**Files:**
- Create: `app/pricing/page.tsx`

This task uses the approved draft copy from the "Draft copy" section at the top of this plan. If copy has been edited there, use the edited version.

- [ ] **Step 1: Create the page file with hero + "why publish" + build anchor sections**

Create `app/pricing/page.tsx`:

```tsx
import Link from "next/link";
import { buildMetadata } from "@/lib/metadata";
import {
  offerSchema,
  faqPageSchema,
  serviceSchema,
} from "@/lib/structured-data";
import { SITE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { FinalCta } from "@/components/sections/FinalCta";
import { PriceAnchorCard } from "@/components/pricing/PriceAnchorCard";
import { OutcomeRow } from "@/components/pricing/OutcomeRow";

export const metadata = buildMetadata({
  title: "Website Pricing — From £5,000 + £149/month · Dreamfree",
  description:
    "Transparent website pricing. Builds from £5,000. Managed service from £149/month, scaling with what your website actually needs to do. No hidden setup fees, no contracts.",
  path: "/pricing",
});

const OUTCOMES = [
  {
    outcome: "I want leads captured and followed up automatically",
    what: "CRM integration + email/SMS follow-up automations, triggered when someone enquires.",
    addsMonthly: "+£30–£60/mo",
  },
  {
    outcome: "I want to be found on Google",
    what: "Ongoing SEO — keyword tracking, content updates, Google Business Profile optimisation, quarterly technical audit.",
    addsMonthly: "+£80–£200/mo",
  },
  {
    outcome: "I want to know what's working",
    what: "Analytics setup, monthly reporting, conversion tracking on forms and calls — plain-English, not a metrics dump.",
    addsMonthly: "+£40–£80/mo",
  },
  {
    outcome: "I need a custom tool maintained alongside the website",
    what: "Ongoing maintenance, support, and feature updates for bespoke software (booking systems, loyalty platforms, compliance tools, etc.).",
    addsMonthly: "+£50–£150/mo per tool",
  },
];

const FAQ = [
  {
    question: "Why don't you have fixed tiers?",
    answer:
      "Because no two small businesses need the same thing. A single-location dental practice and a multi-branch estate agent both want a website, but the work to make each one effective is completely different. Fixed tiers force you to either overpay for features you don't need or underspec and end up with a site that doesn't do its job. Outcome-based pricing matches the fee to what your website actually has to do.",
  },
  {
    question: "Can I see real past projects and what they cost?",
    answer:
      "Yes. Ask on a call and we'll show you the full range — what the client paid upfront, what they pay monthly, what the site does for them. Most land in the £5,000–£15,000 build bracket with monthly fees between £149 and £300.",
  },
  {
    question: "What if my budget is under £5,000?",
    answer:
      "Then Dreamfree isn't the right fit, and we'll say so before wasting your time. For smaller budgets we'd point you at Squarespace or Webflow with a one-off design done by a junior freelancer — honest recommendations are the only way to build trust. If your budget grows in six months, come back.",
  },
  {
    question: "Do you offer payment plans for the upfront fee?",
    answer:
      "Yes. Typically we split the build fee into three stages: 50% on kick-off, 25% at design sign-off, 25% on launch. For flagship projects we'll discuss longer payment schedules.",
  },
  {
    question: "Do I own my website?",
    answer:
      "Completely. The code, the design, the content, the domain — all yours. If you ever decide to leave Dreamfree, you take the site with you and we hand over credentials and documentation.",
  },
  {
    question: "Can I cancel the monthly? What happens to my site if I do?",
    answer:
      "Yes. No long contracts — one month's notice. If you cancel, you own everything and we help you move the site to whatever hosting/management you choose. We'll hand it over cleanly.",
  },
  {
    question: "What counts as a \"mini update\"?",
    answer:
      "Up to 30 minutes of work — typically swapping out a photo, updating opening hours, adding a new team member, changing a headline. Anything bigger we'll quote before doing. Mini updates don't roll over month-to-month.",
  },
];

const COST_ARTICLES = [
  {
    title: "How much does a business website cost in the UK?",
    href: "/learning-centre/how-much-does-a-business-website-cost-uk",
  },
  {
    title: "The hidden costs of a website nobody tells you about",
    href: "/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about",
  },
  {
    title: "Why some web designers charge £500 and others charge £25,000",
    href: "/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000",
  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            serviceSchema({
              name: "Signal Method Website Build",
              description:
                "A full website built on The Signal Method — seven pillars working together to cut through noise and amplify the signals that make your ideal customers take action.",
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            offerSchema({
              name: "Signal Method Website Build",
              description:
                "Transparent pricing: website builds from £5,000; managed service from £149/month.",
              price: "5000",
              url: `${SITE.url}/pricing`,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqPageSchema(FAQ)),
        }}
      />

      {/* ── HERO ── */}
      <section className="px-[clamp(1.25rem,4vw,3rem)] pb-16 pt-32 md:pt-40">
        <div className="mx-auto max-w-[1100px]">
          <div className="text-center">
            <span
              className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
              data-reveal
            >
              Real pricing, published openly
            </span>
            <h1
              className="mx-auto max-w-3xl text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.1] tracking-tight text-charcoal"
              data-reveal
            >
              Websites from £5,000.
              <br />
              <em className="font-serif font-normal italic text-teal">
                Managed from £149 a month.
              </em>
            </h1>
            <p
              className="mx-auto mt-6 max-w-[55ch] text-[1.05rem] leading-relaxed text-slate"
              data-reveal
            >
              No fake tiers. No &ldquo;Request a quote&rdquo;. No contract
              surprises. This is what it actually costs to build and keep a
              website with Dreamfree.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
            <PriceAnchorCard
              kicker="The build"
              figure="£5,000"
              unit="upfront"
              rangeNote="Most Signal Method builds land £8,000–£12,000. Flagship projects with custom tools reach £20,000+."
            />
            <PriceAnchorCard
              kicker="The monthly"
              figure="£149"
              unit="/ month"
              rangeNote="Every client starts here. The fee grows when your website needs to do more — see the outcomes below."
            />
          </div>

          <div className="mt-10 flex flex-col items-center gap-3" data-reveal>
            <Button variant="main" data-modal="signal-flow">
              Get a Free Demo
            </Button>
            <Link
              href="/contact"
              className="text-[0.9rem] font-medium text-slate underline-offset-4 transition-colors hover:text-teal hover:underline"
            >
              Prefer to chat first? Book a 30-minute call
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHY WE PUBLISH REAL NUMBERS ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[720px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Why we publish real numbers
          </span>
          <h2
            className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal"
            data-reveal
          >
            Most agencies won&rsquo;t publish their prices. We think that&rsquo;s backwards.
          </h2>
          <div className="mt-8 space-y-5 text-[1.05rem] leading-[1.7] text-slate">
            <p data-reveal>
              Most agencies won&rsquo;t publish their prices. They&rsquo;d rather get
              you on a sales call first &mdash; where they can figure out your
              budget and price just below it.
            </p>
            <p data-reveal>
              We think that&rsquo;s backwards. If you&rsquo;re researching what a
              website costs, you should be able to find the answer in sixty
              seconds. So here it is, in detail: what Dreamfree charges, why it
              varies, and what happens when a project is bigger or smaller than
              average.
            </p>
            <p data-reveal>
              If our numbers are wrong for your business, you&rsquo;ll know before
              you book a call. That saves both of us time.
            </p>
          </div>
        </div>
      </section>

      {/* ── THE BUILD ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[880px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            The build
          </span>
          <h2
            className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal"
            data-reveal
          >
            Starts at{" "}
            <em className="font-serif font-normal italic text-teal">£5,000</em>.
            Here&rsquo;s what that gets you &mdash; and what takes it higher.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2">
            <div data-reveal>
              <h3 className="mb-4 text-[1rem] font-semibold uppercase tracking-[0.06em] text-charcoal">
                What £5,000 gets you
              </h3>
              <ul className="space-y-3 text-[0.95rem] leading-relaxed text-slate">
                <li>&bull; Full Signal Method website &mdash; seven pillars designed to cut through noise and drive enquiries</li>
                <li>&bull; Homepage plus up to five core pages (e.g. About, Services, Contact, and two you choose)</li>
                <li>&bull; Clear messaging built from the Signal Method audit</li>
                <li>&bull; Mobile-first responsive design, hosted on fast modern infrastructure</li>
                <li>&bull; Handover including analytics setup and a walkthrough of everything you need to know</li>
              </ul>
            </div>
            <div data-reveal>
              <h3 className="mb-4 text-[1rem] font-semibold uppercase tracking-[0.06em] text-charcoal">
                What pushes the build higher
              </h3>
              <ul className="space-y-3 text-[0.95rem] leading-relaxed text-slate">
                <li>&bull; <strong>Premium design direction</strong> (photography, custom illustration, brand refresh) &mdash; typical +£2,000&ndash;£5,000</li>
                <li>&bull; <strong>Larger site</strong> (10+ pages, landing pages, location pages) &mdash; typical +£1,500&ndash;£4,000</li>
                <li>&bull; <strong>CRM + lead follow-up automation</strong> built in at launch &mdash; typical +£1,500&ndash;£3,000</li>
                <li>&bull; <strong>AI integrations</strong> (content generators, chat, lead routing) &mdash; typical +£2,000&ndash;£6,000</li>
                <li>&bull; <strong>Custom tools</strong> (booking systems, loyalty, compliance) &mdash; priced per project, typical £3,000&ndash;£15,000</li>
              </ul>
            </div>
          </div>

          <p
            className="mt-12 text-[1rem] leading-relaxed text-muted"
            data-reveal
          >
            Most Signal Method builds land between{" "}
            <strong className="text-charcoal">£8,000 and £12,000</strong>.
            Flagship projects with custom tools reach{" "}
            <strong className="text-charcoal">£20,000 or more</strong>.
          </p>

          <div className="mt-6" data-reveal>
            <Link
              href="/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000"
              className="text-[0.95rem] font-medium text-teal underline-offset-4 transition-colors hover:underline"
            >
              Read the full breakdown of what drives website prices up &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ── THE MONTHLY ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[880px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            The monthly
          </span>
          <h2
            className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal"
            data-reveal
          >
            Every client starts at{" "}
            <em className="font-serif font-normal italic text-teal">£149 a month</em>.
            The fee grows when your website needs to do more.
          </h2>

          <div className="mt-10" data-reveal>
            <h3 className="mb-4 text-[1rem] font-semibold uppercase tracking-[0.06em] text-charcoal">
              What £149/month always includes
            </h3>
            <ul className="space-y-3 text-[0.95rem] leading-relaxed text-slate">
              <li>&bull; Hosting, security, and daily backups</li>
              <li>&bull; Maintenance and plugin/framework updates</li>
              <li>&bull; Break-fix support &mdash; if something breaks, we fix it</li>
              <li>&bull; One free mini update a month (up to 30 minutes, normally £70)</li>
              <li>&bull; You never deal with DNS, SSL, plugin conflicts, or hosting support tickets</li>
            </ul>
          </div>

          <div className="mt-12">
            <h3
              className="mb-2 text-[1rem] font-semibold uppercase tracking-[0.06em] text-charcoal"
              data-reveal
            >
              What adds to the monthly
            </h3>
            <p
              className="mb-6 text-[0.95rem] text-muted"
              data-reveal
            >
              Pick what matches how you want your site to work.
            </p>
            <div>
              {OUTCOMES.map((row) => (
                <OutcomeRow
                  key={row.outcome}
                  outcome={row.outcome}
                  what={row.what}
                  addsMonthly={row.addsMonthly}
                />
              ))}
            </div>
          </div>

          <p
            className="mt-10 text-[1rem] leading-relaxed text-muted"
            data-reveal
          >
            Most clients land between{" "}
            <strong className="text-charcoal">£149 and £300/month</strong>. Add
            a custom tool and you&rsquo;ll be higher.
          </p>
        </div>
      </section>

      {/* ── WHAT YOU WON'T PAY FOR ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[720px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            What you won&rsquo;t pay for
          </span>
          <h2
            className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal"
            data-reveal
          >
            Most agencies hand you a login and disappear.
            <br />
            <em className="font-serif font-normal italic text-teal">We don&rsquo;t.</em>
          </h2>
          <div className="mt-8 space-y-5 text-[1.05rem] leading-[1.7] text-slate">
            <p data-reveal>
              Most agencies hand you a login and disappear. You end up chasing
              them when WordPress updates break your site, or paying a freelancer
              £80 an hour who&rsquo;s never seen it before. That&rsquo;s the industry
              norm &mdash; and it&rsquo;s why most small business websites rot.
            </p>
            <p data-reveal>
              Your monthly fee is what keeps Dreamfree as your ongoing technical
              partner. You never deal with DNS, SSL, hosting support, plugin
              conflicts, or &ldquo;the developer&rsquo;s moved on&rdquo;. If
              something breaks, it&rsquo;s our problem to fix. If something small
              needs changing, it&rsquo;s included. You stay focused on your
              business; we stay focused on your website.
            </p>
          </div>
        </div>
      </section>

      {/* ── LEARN MORE ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[1100px]">
          <h2
            className="mb-10 text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold tracking-tight text-charcoal"
            data-reveal
          >
            Read more on website pricing
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {COST_ARTICLES.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-teal hover:shadow-[0_12px_32px_rgba(13,115,119,0.1)]"
                data-reveal
              >
                <h3 className="text-[1.05rem] font-semibold leading-snug text-charcoal transition-colors group-hover:text-teal">
                  {a.title}
                </h3>
                <span className="mt-6 text-[0.9rem] font-medium text-teal">
                  Read article &rarr;
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,10vw,8rem)]">
        <div className="mx-auto max-w-[720px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Frequently asked questions
          </span>
          <h2
            className="mb-10 text-[clamp(1.75rem,4vw,2.75rem)] font-bold tracking-tight text-charcoal"
            data-reveal
          >
            The awkward questions, answered.
          </h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-border bg-cream/50 px-6 py-4 transition-colors open:bg-cream"
                data-reveal
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-[1.05rem] font-semibold text-charcoal marker:hidden">
                  {item.question}
                  <span className="text-teal transition-transform duration-300 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-4 text-[0.95rem] leading-relaxed text-slate">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
```

- [ ] **Step 2: Confirm imports resolve**

Check that these imports exist in the codebase:
- `@/lib/metadata` (verified — `buildMetadata` is used by `/services`)
- `@/lib/structured-data` (verified — updated in Task 1)
- `@/lib/constants` (verified — exports `SITE`)
- `@/components/ui/Button` (verified — used by `/services`)
- `@/components/sections/FinalCta` (verified — used by `/services`)
- `@/components/pricing/PriceAnchorCard` (created Task 2)
- `@/components/pricing/OutcomeRow` (created Task 3)

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Run the content validator and build**

Run: `npm run build`
Expected: build succeeds. New route `/pricing` appears in the route table as static (`○`).

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`
Open `http://localhost:3000/pricing`
Verify each section in order:
- Hero shows the kicker, H1 with italic teal accent, subtitle, two anchor cards side-by-side on desktop, "Get a Free Demo" button, "Prefer to chat first?" link
- "Why we publish real numbers" — three paragraphs on cream background
- "The build" — two-column bullets on white background, range paragraph, learn-more link
- "The monthly" — base bullets, outcome rows with prices right-aligned on desktop, closing line
- "What you won't pay for" — two paragraphs on white
- "Read more on website pricing" — 3 cards linking to cost articles
- FAQ — 7 questions as collapsible `<details>` with `+` icons that rotate on open
- `<FinalCta>` block at the bottom

Also check mobile (viewport <768px): anchor cards stack, outcome rows stack, cards are scrollable.

- [ ] **Step 5: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "feat(pricing): add /pricing page with anchors, outcomes, FAQ"
```

---

### Task 5: Add `/pricing` to the sitemap

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: Add the pricing route to `staticPages`**

In `app/sitemap.ts`, replace the `staticPages` array. Find:

```typescript
  const staticPages = [
    { url: SITE.url, lastModified: new Date(), priority: 1.0 },
    { url: `${SITE.url}/about`, lastModified: new Date(), priority: 0.8 },
    {
      url: `${SITE.url}/services`,
      lastModified: new Date(),
      priority: 0.8,
    },
    { url: `${SITE.url}/contact`, lastModified: new Date(), priority: 0.7 },
    {
      url: `${SITE.url}/learning-centre`,
      lastModified: new Date(),
      priority: 0.9,
    },
    {
      url: `${SITE.url}/the-signal-method`,
      lastModified: new Date(),
      priority: 0.8,
    },
  ];
```

Replace with (adds `/pricing` at priority 0.9, same as `/learning-centre` — commercial-intent page):

```typescript
  const staticPages = [
    { url: SITE.url, lastModified: new Date(), priority: 1.0 },
    { url: `${SITE.url}/about`, lastModified: new Date(), priority: 0.8 },
    {
      url: `${SITE.url}/services`,
      lastModified: new Date(),
      priority: 0.8,
    },
    {
      url: `${SITE.url}/pricing`,
      lastModified: new Date(),
      priority: 0.9,
    },
    { url: `${SITE.url}/contact`, lastModified: new Date(), priority: 0.7 },
    {
      url: `${SITE.url}/learning-centre`,
      lastModified: new Date(),
      priority: 0.9,
    },
    {
      url: `${SITE.url}/the-signal-method`,
      lastModified: new Date(),
      priority: 0.8,
    },
  ];
```

- [ ] **Step 2: Verify sitemap renders correctly**

Run: `npm run dev`
Open `http://localhost:3000/sitemap.xml`
Verify: `<url><loc>https://dreamfree.co.uk/pricing</loc>...<priority>0.9</priority></url>` is present.

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(sitemap): add /pricing to static pages"
```

---

### Task 6: Footer link (required) + primary nav (optional)

**Important coupling:** both `Header.tsx` and `Footer.tsx` render the Navigation list from `NAV_LINKS` in `lib/constants.ts`. Adding to `NAV_LINKS` adds to BOTH. If Daniel wants /pricing in the footer but NOT the header, we have to edit `Footer.tsx` directly instead.

**Files:**
- Modify (Option A, if header+footer): `lib/constants.ts`
- Modify (Option B, if footer only): `components/layout/Footer.tsx`

- [ ] **Step 1: Ask Daniel — "Where should `/pricing` appear in site navigation?"**

Offer two options:
- **A. Header nav + footer Navigation column** (cleanest implementation — adds to `NAV_LINKS`)
- **B. Footer Navigation column only, not in the header nav** (requires editing `Footer.tsx` to hardcode the link alongside `NAV_LINKS`)

Wait for answer. Record decision in this plan file. Default if no preference: **A** (cleaner, matches TAYA thesis of surfacing pricing prominently).

- [ ] **Step 2a: If Option A — add to `NAV_LINKS`**

Open `lib/constants.ts`, locate the `NAV_LINKS` array, add this entry. Place it after "Services" or wherever commercial-intent items sit in the existing order:

```typescript
{ href: "/pricing", label: "Pricing" },
```

- [ ] **Step 2b: If Option B — edit `Footer.tsx` directly**

In `components/layout/Footer.tsx`, find the Navigation column `<ul>` that iterates `NAV_LINKS`:

```tsx
{NAV_LINKS.map((link) => (
  <li key={link.href}>
    <Link
      href={link.href}
      className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
    >
      {link.label}
    </Link>
  </li>
))}
```

After that block (still inside the same `<ul>`, before the closing `</ul>`), add a standalone `<li>` for Pricing:

```tsx
<li>
  <Link
    href="/pricing"
    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
  >
    Pricing
  </Link>
</li>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.
Run: `npm run dev`, visit homepage. Scroll to footer; confirm "Pricing" appears in the Navigation column. If Option A, also verify it appears in the header nav (after scroll past hero).

- [ ] **Step 4: Commit**

For Option A:

```bash
git add lib/constants.ts
git commit -m "feat(nav): add Pricing link to primary navigation"
```

For Option B:

```bash
git add components/layout/Footer.tsx
git commit -m "feat(footer): add Pricing link to footer navigation"
```

---

### Task 7: Add inbound internal links

**Files:**
- Modify: `components/ui/ServiceCard.tsx` (add optional `href` prop)
- Modify: `app/services/page.tsx` (update Website Management card)
- Modify: `content/learning-centre/how-much-does-a-business-website-cost-uk.mdx`
- Modify: `content/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about.mdx`
- Modify: `content/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000.mdx`

Context: `ServiceCard` currently renders `description` as plain `<p>` text with no markdown support (verified by reading the file during plan self-review). To link the Website Management card to `/pricing`, add an optional `href` prop that renders a "See pricing →" link at the bottom of the card when provided.

- [ ] **Step 1a: Add optional `href` prop to `ServiceCard`**

In `components/ui/ServiceCard.tsx`:

1. Add `import Link from "next/link";` at the top.
2. Extend `ServiceCardProps` with `href?: string;` and optional `linkLabel?: string` (defaults to "See pricing →").
3. Accept the prop in the destructure, and render a bottom `<Link>` when `href` is supplied.

Full replacement file content:

```tsx
import Link from "next/link";

interface ServiceCardProps {
  tag: string;
  title: string;
  description: string;
  hero?: boolean;
  href?: string;
  linkLabel?: string;
}

export function ServiceCard({
  tag,
  title,
  description,
  hero = false,
  href,
  linkLabel = "See pricing \u2192",
}: ServiceCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-400 ease-smooth ${
        hero
          ? "justify-center border-transparent bg-charcoal p-12 text-[rgba(232,232,240,0.8)] md:row-span-2 hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]"
          : "border-border bg-white hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_12px_40px_rgba(13,115,119,0.07),0_2px_8px_rgba(0,0,0,0.03)]"
      }`}
      data-reveal
    >
      <span
        className={`mb-4 inline-block w-fit rounded-[20px] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${
          hero
            ? "bg-teal text-white"
            : "bg-teal-glow text-teal"
        }`}
      >
        {tag}
      </span>
      <h3
        className={`mb-3 font-bold tracking-tight ${
          hero
            ? "text-[1.75rem] text-white"
            : "text-[clamp(1.1rem,2vw,1.3rem)] text-charcoal"
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-[0.95rem] leading-[1.7] ${
          hero ? "text-[rgba(232,232,240,0.75)]" : "text-slate"
        }`}
      >
        {description}
      </p>
      {href && (
        <Link
          href={href}
          className={`mt-4 text-[0.9rem] font-medium underline-offset-4 transition-colors hover:underline ${
            hero ? "text-teal-bright" : "text-teal"
          }`}
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 1b: Update the Website Management entry on `/services`**

In `app/services/page.tsx`, locate the service entry:

```typescript
{
  tag: "Ongoing",
  title: "Website Management",
  description:
    "Monthly management \u2014 hosting, security, updates, content changes, performance monitoring. From \u00a379/month.",
},
```

Replace with (price updated to £149, href added):

```typescript
{
  tag: "Ongoing",
  title: "Website Management",
  description:
    "Monthly management \u2014 hosting, security, updates, content changes, performance monitoring. From \u00a3149/month.",
  href: "/pricing",
},
```

Then update the `SERVICES.map()` in the JSX to pass `href` through:

Find the current map:

```tsx
{SERVICES.map((svc) => (
  <ServiceCard
    key={svc.title}
    tag={svc.tag}
    title={svc.title}
    description={svc.description}
    hero={svc.hero}
  />
))}
```

Replace with:

```tsx
{SERVICES.map((svc) => (
  <ServiceCard
    key={svc.title}
    tag={svc.tag}
    title={svc.title}
    description={svc.description}
    hero={svc.hero}
    href={svc.href}
  />
))}
```

Also update the `SERVICES` array type if it has an inline type — TypeScript will need to accept `href?: string` on entries. Given the existing inline object literal, TypeScript should infer it automatically without a named type. If a named type exists, extend it.

- [ ] **Step 2: Add a pricing-page link to `how-much-does-a-business-website-cost-uk.mdx`**

Open `content/learning-centre/how-much-does-a-business-website-cost-uk.mdx`. Scan the body for a natural insertion point (e.g. near the end of the first or second section where UK price brackets are discussed, or in a closing paragraph).

Add one sentence with a link. Example insertion text (adapt wording to the surrounding prose):

```markdown
For Dreamfree specifically, our builds start at £5,000 and our monthly managed service starts at £149/month — [full breakdown on our pricing page](/pricing).
```

- [ ] **Step 3: Add a pricing-page link to `hidden-costs-of-a-website-nobody-tells-you-about.mdx`**

Open `content/learning-centre/hidden-costs-of-a-website-nobody-tells-you-about.mdx`. Scan for a natural insertion point — likely in the closing section or wherever the article discusses what's included in Dreamfree's pricing vs what isn't.

Add one sentence with a link. Example:

```markdown
This is why [our own pricing page](/pricing) breaks down exactly what's included in the monthly fee and what isn't — so there are no surprises.
```

- [ ] **Step 4: Add a pricing-page link to `why-some-web-designers-charge-500-and-others-charge-25000.mdx`**

Open `content/learning-centre/why-some-web-designers-charge-500-and-others-charge-25000.mdx`. Scan for a natural insertion point — typically where the article arrives at "so what should you pay" or closes out.

Add one sentence with a link. Example:

```markdown
If you're curious where Dreamfree sits in this range, [our pricing page](/pricing) shows the full picture — starting at £5,000, with most builds landing between £8,000 and £12,000.
```

- [ ] **Step 5: Run the content validator and build**

Run: `npm run build`
Expected: `prebuild` content validator succeeds, build succeeds, all pages regenerate.

- [ ] **Step 6: Manual check of all four pages**

Run: `npm run dev`
1. Visit `/services`, confirm the Website Management card now links to `/pricing` and price reads £149/month.
2. Visit each of the three cost articles, Ctrl+F for `/pricing` link, confirm it renders as a clickable link and the surrounding sentence reads naturally.

- [ ] **Step 7: Commit**

```bash
git add app/services/page.tsx content/learning-centre
# If ServiceCard was modified:
git add components/ui/ServiceCard.tsx
git commit -m "feat: add inbound links to /pricing from services and cost articles"
```

---

### Task 8: Final verification (full site)

- [ ] **Step 1: Clean build**

Run: `rm -rf .next && npm run build`
Expected: build succeeds with no errors. The route table shows `/pricing` as `○` (static prerendered).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual final pass — all affected pages**

Run: `npm run dev`

Check each:
- `/pricing` — all 8 sections render correctly on desktop and mobile
- `/` (homepage) — footer Navigation column (if Task 6 enabled nav) shows "Pricing" link; header nav shows "Pricing" once scrolled past hero
- `/services` — Website Management card links to `/pricing`, price shows £149
- Each of the three cost articles — contains a body link to `/pricing` that reads naturally
- `/sitemap.xml` — contains `/pricing` with priority 0.9

- [ ] **Step 4: Structured data validation**

Open the rendered `/pricing` in dev tools → Elements. Verify three `<script type="application/ld+json">` blocks are present, containing: `Service`, `Offer` (with `price: "5000"`, `priceCurrency: "GBP"`), and `FAQPage` with 7 questions.

- [ ] **Step 5: No commit needed for this task** — verification only.

---

### Task 9: Push to production

- [ ] **Step 1: Push the commits**

```bash
git push origin master
```

- [ ] **Step 2: Wait ~3 minutes for Vercel deploy, then verify production**

Once deploy completes, verify from outside the dev environment:

```bash
# Expect 200 OK
curl -sSI https://dreamfree.co.uk/pricing | head -3

# Expect 200 OK and /pricing inside the XML body
curl -s https://dreamfree.co.uk/sitemap.xml | grep "/pricing"

# Expect 200 OK and the £149 price + link to /pricing in HTML
curl -s https://dreamfree.co.uk/services | grep -E "£149|\"/pricing\""
```

- [ ] **Step 3: Request indexing in GSC (manual — Daniel)**

In Google Search Console:
1. Select property `sc-domain:dreamfree.co.uk`.
2. URL Inspection → paste `https://dreamfree.co.uk/pricing`.
3. Click "Request Indexing".

Also verify the sitemap auto-picks up the new URL on next crawl (no action needed if `sitemap.xml` is already submitted).

---

### Task 10: Update the SEO log

**Files:**
- Modify: `mission-control/docs/seo/dreamfree-seo-log.md`

- [ ] **Step 1: Add a new entry under "Actions log"**

Append to the "Actions log" section of `mission-control/docs/seo/dreamfree-seo-log.md`, after the Phase 1 entries. Use this format:

```markdown
### 2026-04-17 — Phase 2 piece 1: pricing page

#### Action D: ship /pricing page (first TAYA conversion piece)
- **Files:** new `app/pricing/page.tsx`, new `components/pricing/{PriceAnchorCard,OutcomeRow}.tsx`, `lib/structured-data.ts` (added offer + FAQPage schemas), `app/sitemap.ts` (added /pricing), `app/services/page.tsx` (linked + updated price to £149), three cost articles in `content/learning-centre/` (inbound links added)[, `lib/constants.ts` (nav entry added IF Task 6 opted in)].
- **Commits:** [fill in actual commit SHAs after push — from git log]
- **Deployed:** 2026-04-17 (fill actual date) via Vercel. Verified: /pricing returns 200, sitemap contains it, structured data renders, /services and cost articles link inbound.
- **Indexing requested:** Daniel submitted /pricing via GSC URL Inspection on [date].
- **Driver:** GSC baseline showed zero buyer-intent queries. Pricing is the highest-commercial-intent TAYA piece — a real anchor for rank-for + convert-on "website pricing uk" / "small business website cost".
- **Content decisions on page (reference for future edits):**
  - Build anchor: "Websites from £5,000" (most £8-12k, flagship £20k+)
  - Monthly anchor: "from £149/month" (£79 floor retired; £79 → £149 change NOT referenced on page per pricing-model memory)
  - 4 outcomes drive monthly growth: CRM/automations, SEO, analytics/reporting, custom-tool maintenance
  - Dual CTA: Free Demo primary, "Prefer to chat?" secondary to /contact
  - 7-question FAQ in `<details>` accordions
- **Expected outcome — 3-8 weeks out:**
  1. /pricing indexed and receiving impressions in GSC within 3 weeks.
  2. First buyer-intent queries appear in GSC (anything with `price`, `cost`, `£`, `subscription`).
  3. Demo requests or call bookings attributable to /pricing traffic in Clarity/GA4.
  4. /services Website Management card starts showing referral traffic to /pricing in Clarity.
- **How to verify next review:**
  - GSC → query report filtered by `page = /pricing` — any impressions? any clicks? any buyer-intent query text?
  - Clarity → referring URL data for /pricing — how much traffic, from where?
  - Clarity → session recordings filtered to /pricing — are visitors reading the FAQ, clicking to demo, bouncing on the price?
  - If 4+ weeks in and /pricing has <20 impressions, check GSC → Pages → /pricing coverage state. May need another index request or backlink.
```

- [ ] **Step 2: Update the "Phase 2 — TAYA content plan" section header**

Change the phase header in `mission-control/docs/seo/dreamfree-seo-log.md` from:

```markdown
## Phase 2 — TAYA content plan (NOT YET STARTED)
```

to:

```markdown
## Phase 2 — TAYA content plan (IN PROGRESS)

**Shipped:** /pricing (2026-04-17). See Actions log entry D.

**Next pieces (in priority order):**
```

(Keep the rest of the section as-is — the priority list of Cost/Comparisons/Best-of/Problems/Reviews.)

- [ ] **Step 3: Update "Current status" at the top of the log**

Find:

```markdown
**Phase 2 — TAYA content plan: NOT STARTED.** Awaiting Daniel's go-ahead.
```

Replace with:

```markdown
**Phase 2 — TAYA content plan: IN PROGRESS.** /pricing shipped 2026-04-17. Next piece: comparisons (Dreamfree vs Wix / Squarespace / custom).
```

- [ ] **Step 4: Commit the log update**

```bash
cd ../../mission-control
git add docs/seo/dreamfree-seo-log.md
git commit -m "docs(seo): log Phase 2 piece 1 — /pricing page"
```

(Note: the SEO log lives in the `mission-control` repo, not `dreamfree-site`. Separate commit.)

---

## Out of scope for this plan

- Rewriting the 3 existing cost articles.
- Comparison pages (Dreamfree vs Wix, etc.) — next piece in Phase 2.
- Niche landing pages (vets, trades, etc.) — Phase 3.
- Testimonial or case-study blocks on /pricing — covered sitewide by `FinalCta`.
- Payment-plans detail page — if offered, separate page; `/pricing` only answers "yes/no" in FAQ.
- Changing the header `Header.tsx` visual design or behaviour — Task 6 is purely a data change to `NAV_LINKS`.

## Open questions (resolved during execution)

| Question | Resolved in | How |
|---|---|---|
| Exact monthly outcome ranges | This plan's Draft Copy section | Daniel to confirm ranges in review before execution |
| Final H1 and hero subtitle | This plan's Draft Copy section | Locked unless Daniel edits inline |
| Final FAQ content (7 Qs) | This plan's Draft Copy section | Locked unless Daniel edits inline |
| Does /pricing go in the nav | Task 6 Step 1 | Ask Daniel during execution |
