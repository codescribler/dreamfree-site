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
