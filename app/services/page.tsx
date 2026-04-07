import { buildMetadata } from "@/lib/metadata";
import { serviceSchema } from "@/lib/structured-data";
import { PageHero } from "@/components/sections/PageHero";
import { FinalCta } from "@/components/sections/FinalCta";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { Button } from "@/components/ui/Button";

export const metadata = buildMetadata({
  title: "Services — Dreamfree",
  description:
    "Everything your website needs to start converting. Built on The Signal Method.",
  path: "/services",
});

const SERVICES = [
  {
    tag: "Core",
    title: "Signal Method Website Build",
    description:
      "A full website built on The Signal Method. Seven pillars working together to cut through noise and amplify the signals that make your ideal customers take action.",
    hero: true,
  },
  {
    tag: "Diagnosis",
    title: "Signal Score & Full Report",
    description:
      "Your free Signal Score tells you where you stand. The full report gives you the complete breakdown and a messaging blueprint.",
  },
  {
    tag: "Risk-Free",
    title: "Speculative Demo",
    description:
      "Not sure if a new website is worth it? We build one first \u2014 a fully designed homepage sent before any sales conversation.",
  },
  {
    tag: "Ongoing",
    title: "Website Management",
    description:
      "Monthly management \u2014 hosting, security, updates, content changes, performance monitoring. From \u00a379/month.",
  },
  {
    tag: "Optimisation",
    title: "Conversion Optimisation",
    description:
      "Good website, no leads? We analyse behaviour, find drop-offs, and restructure your pages for better results.",
  },
  {
    tag: "Visibility",
    title: "Local SEO & Google Business",
    description:
      "We optimise your Google Business Profile, build local citations, and structure your site for the searches your customers make.",
  },
];

export default function ServicesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            serviceSchema({
              name: "Signal Method Website Build",
              description:
                "A full website built on The Signal Method \u2014 seven pillars working together to cut through noise and amplify the signals that make your ideal customers take action.",
            })
          ),
        }}
      />

      <PageHero
        title="Everything your website needs"
        titleAccent="to start converting."
        subtitle="Every service is built on The Signal Method &mdash; the same seven-pillar framework we use to audit, build, and optimise websites that actually drive enquiries."
      />

      {/* ── SERVICE CARDS ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            What We Offer
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Services built on
            <br />
            <em className="font-serif font-normal italic text-teal">
              The Signal Method.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-[1.4fr_1fr]">
            {SERVICES.map((svc) => (
              <ServiceCard
                key={svc.title}
                tag={svc.tag}
                title={svc.title}
                description={svc.description}
                hero={svc.hero}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── NOT SURE? ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[720px] text-center">
          <h2
            className="mb-4 text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal"
            data-reveal
          >
            Not sure what you need?
          </h2>
          <p
            className="mx-auto mb-8 max-w-[55ch] text-[1.05rem] leading-[1.7] text-slate"
            data-reveal
          >
            Start with your Signal Score &mdash; it&rsquo;ll tell you exactly
            where your website is falling short and which service fits.
          </p>
          <div data-reveal>
            <Button variant="main" data-modal="signal-flow">
              Get Your Free Signal Score
            </Button>
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
