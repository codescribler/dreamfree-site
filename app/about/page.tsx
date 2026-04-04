import Image from "next/image";
import Link from "next/link";
import { buildMetadata } from "@/lib/metadata";
import { PageHero } from "@/components/sections/PageHero";
import { FinalCta } from "@/components/sections/FinalCta";
import { TestimonialCard } from "@/components/ui/TestimonialCard";

export const metadata = buildMetadata({
  title: "About — Dreamfree",
  description:
    "Meet Daniel Whittaker — former Royal Marine Commando, now building websites that convert using The Signal Method.",
  path: "/about",
});

const METHOD_ELEMENTS = [
  {
    number: 1,
    title: "Story",
    description:
      "Your customer is the hero. Your website must make it immediately clear who it serves and what outcome they\u2019re seeking.",
    miss: "Most sites open with \u201cWelcome to [Business Name]\u201d \u2014 that\u2019s talking about yourself.",
  },
  {
    number: 2,
    title: "Design",
    description:
      "Visual design that amplifies the message. Purposeful typography, imagery that supports the story, colour that guides emotion.",
    miss: "Generic stock photos and template layouts that say nothing about the business.",
  },
  {
    number: 3,
    title: "Direction",
    description:
      "Clear user flow with no dead ends. One primary CTA repeated consistently. A simple plan that removes confusion.",
    miss: "Multiple competing CTAs, no obvious next step, visitors leave confused.",
  },
  {
    number: 4,
    title: "Diagnosis",
    description:
      "The business positions itself as a credible guide \u2014 demonstrating empathy and authority through credentials, testimonials, and methodology.",
    miss: "No testimonials, no qualifications shown, nothing that says \u201cyou can trust us.\u201d",
  },
  {
    number: 5,
    title: "Measurement",
    description:
      "Analytics, heatmaps, conversion tracking, and data-driven improvement. A website is never \u201cdone.\u201d",
    miss: "Set-and-forget websites with no tracking, no idea what\u2019s working or not.",
  },
];

const PRINCIPLES = [
  {
    title: "We show before we sell.",
    description:
      "We build your homepage before you\u2019ve spent a penny. If it doesn\u2019t impress you, no hard feelings.",
  },
  {
    title: "Your customer is the hero, not you.",
    description:
      "Every heading, every paragraph, every CTA is written from your customer\u2019s perspective \u2014 not yours.",
  },
  {
    title: "Measure everything.",
    description:
      "If we can\u2019t measure it, we can\u2019t improve it. Every site comes with analytics, tracking, and regular performance reviews.",
  },
  {
    title: "Simple beats clever.",
    description:
      "Clear language, clean design, obvious next steps. We\u2019d rather be understood than admired.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        title="Built by a Royal Marine."
        titleAccent="Run like a mission."
        subtitle="Daniel Whittaker spent years in the Royal Marines, where the standard is simple: prepare thoroughly, execute precisely, and never leave someone behind. Now he applies that same discipline to building websites that actually perform. Dreamfree exists because too many small businesses have websites that look fine but don&rsquo;t work &mdash; and nobody&rsquo;s telling them why."
      />

      {/* ── HERO IMAGE ── */}
      <section className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] pb-[clamp(3rem,6vw,5rem)]">
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-2xl sm:aspect-[3/2]"
          data-reveal
        >
          <Image
            src="/images/roaylmarines.jpg"
            alt="Daniel Whittaker during Royal Marines commando training"
            fill
            className="object-cover object-bottom"
            sizes="(max-width: 768px) 100vw, 1340px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/40 to-transparent" />
        </div>
      </section>

      {/* ── ABOUT DANIEL ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(4rem,8vw,6rem)]">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-8 md:flex-row md:items-start">
          <div className="h-[200px] w-[200px] shrink-0 overflow-hidden rounded-full">
            <Image
              src="/images/daniel-profile.jpg"
              alt="Daniel Whittaker — founder of Dreamfree"
              width={337}
              height={600}
              className="h-full w-full object-cover object-[50%_15%]"
            />
          </div>
          <div>
            <h2
              className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-tight text-charcoal"
              data-reveal
            >
              Daniel Whittaker
            </h2>
            <p className="mt-1 text-[0.85rem] font-semibold uppercase tracking-[0.1em] text-teal">
              Founder, Dreamfree
            </p>
            <p
              className="mt-4 max-w-[55ch] text-[1rem] leading-[1.8] text-slate"
              data-reveal
            >
              Former Royal Marine Commando turned web strategist. Daniel builds
              websites that convert using The Signal Method &mdash; a framework
              that puts your customer at the centre of every design decision.
            </p>
          </div>
        </div>
      </section>

      {/* ── THE SIGNAL METHOD ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            The Framework
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            The Signal
            <br />
            <em className="font-serif font-normal italic text-teal">
              Method.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {METHOD_ELEMENTS.map((el) => (
              <div
                key={el.number}
                className="rounded-2xl border border-border bg-white p-8 transition-all duration-400 ease-smooth hover:-translate-y-[3px] hover:border-transparent hover:shadow-[0_16px_48px_rgba(13,115,119,0.08),0_4px_12px_rgba(0,0,0,0.04)]"
                data-reveal
              >
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                  {String(el.number).padStart(2, "0")}
                </span>
                <h3 className="mb-2 text-lg font-bold tracking-tight text-charcoal">
                  {el.title}
                </h3>
                <p className="text-[0.95rem] leading-[1.7] text-slate">
                  {el.description}
                </p>
                <p className="mt-3 text-[0.85rem] leading-[1.6] italic text-muted">
                  {el.miss}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center" data-reveal>
            <Link
              href="/the-signal-method"
              className="inline-block rounded-[60px] border-2 border-teal bg-transparent px-8 py-3 text-[0.9rem] font-semibold text-teal transition-all duration-350 ease-spring hover:-translate-y-0.5 hover:bg-teal hover:text-white hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]"
            >
              Learn the Signal Method &mdash; free 5-day course
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRINCIPLES ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[900px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            How We Work
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Principles.
          </h2>
          <div className="mt-12 space-y-0">
            {PRINCIPLES.map((p, i) => (
              <div
                key={i}
                className="border-b border-border py-8 first:pt-0 last:border-b-0"
                data-reveal
              >
                <h3 className="mb-2 text-[1.15rem] font-bold text-charcoal">
                  {p.title}
                </h3>
                <p className="max-w-[60ch] text-[0.95rem] leading-[1.7] text-slate">
                  {p.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-warm-grey px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Client Results
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Don&rsquo;t take
            <br />
            <em className="font-serif font-normal italic text-teal">
              our word for it.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <TestimonialCard
              quote="Daniel didn't just build us a website — he completely reframed how we talk about what we do. Before working with Dreamfree, our site was all about us. Daniel flipped it so it was about our customers and their problems. The difference was immediate."
              author="Brent M."
              role="The Renovation Planner"
            />
            <TestimonialCard
              quote="We'd been through two web designers before Daniel. He took the time to understand who our customers are and what they care about. The site he built doesn't just look good — it brings people through the door. Our loyalty sign-ups increased significantly after launch."
              author="Mary-Ann & Emma"
              role="The Meat Hook"
            />
            <TestimonialCard
              quote="Having Dreamfree handle our site maintenance has been so helpful. They take care of all our WordPress updates and backups with minimal fuss. Their team responds quickly when needed, and our site has been running smoothly since they took over. It's one less thing to worry about so we can focus on our actual business."
              author="Pierre Carion"
              role="Bite Size Safety"
            />
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
