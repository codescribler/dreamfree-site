import { buildMetadata } from "@/lib/metadata";
import { localBusinessSchema } from "@/lib/structured-data";
import { SITE } from "@/lib/constants";
import { PageHero } from "@/components/sections/PageHero";
import { FinalCta } from "@/components/sections/FinalCta";
import { Button } from "@/components/ui/Button";
import { ContactForm } from "@/components/sections/ContactForm";

export const metadata = buildMetadata({
  title: "Contact — Dreamfree",
  description:
    "Get in touch with Daniel about your website. Start with your Signal Score or send a message directly.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(localBusinessSchema()),
        }}
      />

      <PageHero
        title="Let's talk about"
        titleAccent="your website."
        subtitle="Whether you&rsquo;ve seen your Signal Score and want to discuss it, or you just know something needs to change &mdash; start here."
      />

      {/* ── TWO-COLUMN: SIGNAL SCORE + FORM ── */}
      <section className="px-[clamp(1.25rem,4vw,3rem)] pb-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 md:grid-cols-2">
          {/* Signal Score Card */}
          <div
            className="flex flex-col justify-between rounded-2xl border border-border bg-cream p-10"
            data-reveal
          >
            <div>
              <h3 className="mb-3 text-xl font-bold text-charcoal">
                Not sure where to start?
              </h3>
              <p className="mb-8 text-[0.95rem] leading-[1.7] text-slate">
                Your free Signal Score tells you exactly where your website is
                falling short &mdash; and which fix will make the biggest
                difference. Takes 60 seconds.
              </p>
            </div>
            <div>
              <Button variant="main" data-modal="signal-flow">
                Get Your Free Signal Score
              </Button>
            </div>
          </div>

          {/* Contact Form Card */}
          <div
            className="rounded-2xl border border-border bg-white p-10"
            data-reveal
          >
            <h3 className="mb-6 text-xl font-bold text-charcoal">
              Send a message
            </h3>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* ── CONTACT DETAILS ── */}
      <section className="border-t border-border px-[clamp(1.25rem,4vw,3rem)] py-16">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-8 sm:flex-row sm:justify-between">
          <div data-reveal>
            <span className="mb-1 block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
              Phone
            </span>
            <a
              href={SITE.phoneTel}
              className="text-[1.05rem] font-medium text-charcoal transition-colors duration-200 hover:text-teal"
            >
              {SITE.phone}
            </a>
          </div>
          <div data-reveal>
            <span className="mb-1 block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
              Email
            </span>
            <a
              href={`mailto:${SITE.email}`}
              className="text-[1.05rem] font-medium text-charcoal transition-colors duration-200 hover:text-teal"
            >
              {SITE.email}
            </a>
          </div>
          <div data-reveal>
            <span className="mb-1 block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
              Location
            </span>
            <span className="text-[1.05rem] font-medium text-charcoal">
              {SITE.location}
            </span>
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
