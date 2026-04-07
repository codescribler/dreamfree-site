import Link from "next/link";

interface CourseBannerProps {
  compact?: boolean;
}

export function CourseBanner({ compact }: CourseBannerProps) {
  if (compact) {
    return (
      <div className="mx-auto max-w-[720px] px-[clamp(1.25rem,4vw,3rem)] py-8">
        <Link
          href="/the-signal-method"
          className="group flex flex-col items-center gap-4 rounded-2xl border border-teal/20 bg-teal-glow p-6 text-center transition-all duration-400 ease-smooth hover:-translate-y-0.5 hover:border-teal/30 hover:shadow-[0_8px_24px_rgba(13,115,119,0.1)] sm:flex-row sm:text-left"
          data-reveal
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-bold text-white">
            7
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-charcoal">
              The Signal Method — Free 7-Day Email Course
            </h3>
            <p className="mt-1 text-sm text-slate">
              Learn the seven pillars every business needs to cut through
              marketing noise and win customers. One lesson per day, zero fluff.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-teal transition-colors duration-300 group-hover:text-teal-deep">
            Start free &rarr;
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] py-8"
      data-reveal
    >
      <Link
        href="/the-signal-method"
        className="group flex flex-col gap-6 rounded-2xl border border-teal/20 bg-teal-glow p-8 transition-all duration-400 ease-smooth hover:-translate-y-0.5 hover:border-teal/30 hover:shadow-[0_8px_24px_rgba(13,115,119,0.1)] md:flex-row md:items-center"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal text-2xl font-bold text-white">
          7
        </div>
        <div className="flex-1">
          <span className="mb-1 inline-block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-teal">
            Free Email Course
          </span>
          <h3 className="text-lg font-bold text-charcoal md:text-xl">
            The Signal Method — 7 lessons that change how you think about your
            website
          </h3>
          <p className="mt-2 max-w-[55ch] text-[0.9rem] leading-[1.7] text-slate">
            Over seven days, learn the seven pillars every business needs to cut
            through marketing noise and win customers. One lesson per day,
            practical takeaways you can apply immediately.
          </p>
        </div>
        <span className="shrink-0 rounded-[60px] bg-teal px-6 py-2.5 text-[0.85rem] font-semibold text-white transition-all duration-350 ease-spring group-hover:-translate-y-0.5 group-hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]">
          Start free &rarr;
        </span>
      </Link>
    </div>
  );
}
