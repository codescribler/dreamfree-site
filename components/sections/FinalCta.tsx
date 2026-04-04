import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-teal py-[clamp(5rem,12vw,10rem)]">
      {/* Radial gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.06), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[850px] px-[clamp(1.25rem,4vw,3rem)] text-center">
        <h2
          className="mb-6 text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
          data-reveal
        >
          What&rsquo;s your website&rsquo;s{" "}
          <em className="font-serif font-normal italic text-white/85">
            Signal Score?
          </em>
        </h2>
        <p
          className="mx-auto mb-10 max-w-[55ch] text-[1.1rem] leading-[1.7] text-white/75"
          data-reveal
        >
          Most sites score below 40. Find out where yours stands — free, in 60
          seconds. You&rsquo;ll get a score out of 100 and your single biggest
          quick win.
        </p>
        <div className="flex flex-col items-center gap-5" data-reveal>
          <Button variant="main-inv" data-modal="signal-flow">
            Get Your Free Signal Score
          </Button>
          <a
            href={SITE.phoneTel}
            className="border-b border-white/20 pb-0.5 text-[0.95rem] font-medium text-white/60 transition-all duration-300 ease-smooth hover:border-white/50 hover:text-white"
          >
            Rather talk? Call Daniel: {SITE.phone}
          </a>
        </div>
        <p
          className="mt-6 text-[0.85rem] tracking-wide text-white/45"
          data-reveal
        >
          Free. 60 seconds. No details required.
        </p>
      </div>
    </section>
  );
}
