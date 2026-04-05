import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";
import { AmbientBlobs } from "./AmbientBlobs";
import { HeroBubbles } from "./HeroBubbles";

export function Hero() {
  return (
    <section className="relative flex min-h-dvh items-center overflow-hidden px-[clamp(1.25rem,4vw,3rem)] pt-32 pb-16">
      <HeroBubbles />
      <AmbientBlobs />

      <div className="mx-auto grid w-full max-w-[1340px] items-center gap-[clamp(3rem,6vw,6rem)] max-md:grid-cols-1 md:grid-cols-[1.15fr_1fr]">
        {/* Copy */}
        <div>
          <p
            className="mb-6 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-teal"
            data-reveal
          >
            &ldquo;A website is more than a brochure with buttons. It&rsquo;s
            the beginning of a conversation.&rdquo;
          </p>
          <h1
            className="mb-8 text-[clamp(3rem,7vw,5.5rem)] font-black leading-[0.95] tracking-tighter text-charcoal"
            data-reveal
          >
            Is your website
            <br />
            <span className="font-serif text-[1.05em] font-bold italic text-teal">
              costing you
            </span>
            <br />
            customers?
          </h1>
          <p
            className="mb-10 max-w-[50ch] text-[clamp(1rem,1.6vw,1.15rem)] leading-[1.75] text-slate"
            data-reveal
          >
            There are five things that make someone pick up the phone — or
            leave. Most business websites get fewer than half right. Check yours
            free, in 60 seconds.
          </p>
          <div
            className="flex flex-wrap items-center gap-5 max-[480px]:flex-col max-[480px]:items-stretch"
            data-reveal
          >
            <Button data-modal="signal-flow">
              Get Your Free Signal Score
            </Button>
            <Button variant="ghost" href={SITE.phoneTel}>
              Rather talk? Call Daniel
            </Button>
          </div>

          {/* Mini plan */}
          <div
            className="mt-6 flex flex-wrap items-center gap-3 max-sm:gap-2"
            data-reveal
          >
            {[
              "Get your Signal Score",
              "Book a 15-min call",
              "Get a free homepage redesign",
            ].map((step, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span
                    className="text-[0.8rem] text-border max-sm:hidden"
                    aria-hidden="true"
                  >
                    &rarr;
                  </span>
                )}
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-teal-glow text-[0.7rem] font-bold text-teal">
                  {i + 1}
                </span>
                <span className="text-[0.82rem] font-medium text-slate">
                  {step}
                </span>
              </span>
            ))}
          </div>

          <p
            className="mt-3 w-full text-center text-[0.8rem] text-muted"
            data-reveal
          >
            Free. 60 seconds. No sales pitch — just a number and your top fix.
          </p>
          <p
            className="mt-2 w-full text-center text-[0.8rem] text-muted"
            data-reveal
          >
            We take on a limited number of clients each month —{" "}
            <strong className="font-semibold text-teal">
              currently accepting 2 new projects
            </strong>
            .
          </p>
        </div>

        {/* Hero visual */}
        <div className="relative" data-reveal>
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl max-md:aspect-video max-md:max-h-[380px]">
            <Image
              src="/images/hero.jpg"
              alt="Business strategy workspace"
              fill
              className="object-cover"
              priority
              sizes="(max-width: 900px) 100vw, 45vw"
            />
          </div>
          <div className="absolute -left-8 bottom-8 z-10 flex flex-col rounded-[10px] bg-white p-4 px-6 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)] max-md:bottom-4 max-md:left-4">
            <span className="text-[2rem] font-extrabold leading-none tracking-tight text-teal">
              100+
            </span>
            <span className="mt-1 text-[0.75rem] font-medium text-muted">
              Websites scored
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
