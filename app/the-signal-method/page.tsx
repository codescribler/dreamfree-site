import { buildMetadata } from "@/lib/metadata";
import { PageHero } from "@/components/sections/PageHero";
import { FinalCta } from "@/components/sections/FinalCta";
import { CourseSignup } from "@/components/sections/CourseSignup";

export const metadata = buildMetadata({
  title: "The Signal Method — Free 5-Day Email Course",
  description:
    "Learn the five elements every business website needs to convert visitors into customers. One lesson per day, zero fluff. Free.",
  path: "/the-signal-method",
});

const LESSONS = [
  {
    day: 1,
    title: "Story",
    subtitle: "Your customer is the hero — not you.",
    description:
      "Most business websites open with the company name and a stock photo. Day one shows you why that drives visitors away, and how to rewrite your homepage around the person you actually serve.",
  },
  {
    day: 2,
    title: "Design",
    subtitle: "Visual hierarchy that amplifies your message.",
    description:
      "Good design isn\u2019t decoration \u2014 it\u2019s communication. Learn the squint test, why your current layout is hiding the things that matter, and how to fix it without a redesign.",
  },
  {
    day: 3,
    title: "Direction",
    subtitle: "Clear paths, not dead ends.",
    description:
      "Every page should have one job. Day three covers the CTA hierarchy, the three-step plan that removes friction, and why competing calls to action are costing you enquiries.",
  },
  {
    day: 4,
    title: "Diagnosis",
    subtitle: "Be the guide, not the hero.",
    description:
      "Visitors need to trust you before they\u2019ll call you. Learn how to demonstrate empathy and authority through testimonials, credentials, and methodology \u2014 without sounding arrogant.",
  },
  {
    day: 5,
    title: "Measurement",
    subtitle: "If you can\u2019t measure it, you can\u2019t improve it.",
    description:
      "A website is never done. Day five covers the three numbers every business owner should track, and how to set up simple measurement that tells you exactly what\u2019s working.",
  },
];

export default function SignalMethodCoursePage() {
  return (
    <>
      <PageHero
        title="The five things your website needs to"
        titleAccent="actually convert."
        subtitle="A free 5-day email course that teaches you The Signal Method — the same framework we use to build websites that bring in customers. One lesson per day, practical takeaways you can apply immediately."
      />

      {/* ── SIGNUP ── */}
      <section className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] pb-[clamp(3rem,6vw,5rem)]">
        <CourseSignup />
      </section>

      {/* ── WHAT YOU'LL LEARN ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[900px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            The Curriculum
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Five days.
            <br />
            <em className="font-serif font-normal italic text-teal">
              Five elements.
            </em>
          </h2>
          <div className="mt-12 space-y-0">
            {LESSONS.map((lesson) => (
              <div
                key={lesson.day}
                className="border-b border-border py-8 first:pt-0 last:border-b-0"
                data-reveal
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                    {lesson.day}
                  </span>
                  <div>
                    <h3 className="text-[1.15rem] font-bold text-charcoal">
                      {lesson.title}
                      <span className="ml-2 font-serif font-normal italic text-teal">
                        — {lesson.subtitle}
                      </span>
                    </h3>
                    <p className="mt-2 max-w-[55ch] text-[0.95rem] leading-[1.7] text-slate">
                      {lesson.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Who This Is For
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Built for business owners,
            <br />
            <em className="font-serif font-normal italic text-teal">
              not web designers.
            </em>
          </h2>
          <div
            className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            data-reveal
          >
            {[
              {
                title: "You have a website that looks OK but doesn\u2019t generate leads.",
                text: "The course will show you exactly why — and what to fix first.",
              },
              {
                title: "You\u2019ve been burned by web designers before.",
                text: "You\u2019ll understand what to ask for next time, or how to evaluate what you already have.",
              },
              {
                title: "You\u2019re about to invest in a new website.",
                text: "Learn the framework before you brief anyone. It\u2019ll save you thousands in wrong turns.",
              },
              {
                title: "You rely on word of mouth and want a second channel.",
                text: "A website that converts is the most reliable lead generation tool a small business can have.",
              },
              {
                title: "You\u2019re a freelancer or agency wanting a framework.",
                text: "The Signal Method gives you a repeatable process for auditing and improving any business website.",
              },
              {
                title: "You just want to understand what \u201Cgood\u201D looks like.",
                text: "Five short lessons that give you a vocabulary for talking about website performance.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-warm-grey p-6"
              >
                <h3 className="mb-2 text-[0.95rem] font-bold text-charcoal">
                  {item.title}
                </h3>
                <p className="text-[0.85rem] leading-[1.65] text-slate">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL SIGNUP ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <div className="mx-auto max-w-[600px] text-center">
            <h2
              className="text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-charcoal"
              data-reveal
            >
              Ready to learn what your website
              <br />
              <em className="font-serif font-normal italic text-teal">
                should be doing?
              </em>
            </h2>
            <p className="mx-auto mt-4 max-w-[45ch] text-slate" data-reveal>
              Five emails. Five elements. Zero cost. Unsubscribe any time.
            </p>
            <div className="mt-8" data-reveal>
              <CourseSignup />
            </div>
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
