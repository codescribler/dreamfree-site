import Link from "next/link";

interface InsightCardProps {
  href: string;
  tag: string;
  title: string;
  description: string;
  readTime: string;
  highlight?: boolean;
}

export function InsightCard({
  href,
  tag,
  title,
  description,
  readTime,
  highlight = false,
}: InsightCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-8 pb-7 transition-all duration-400 ease-smooth hover:-translate-y-1 ${
        highlight
          ? "border-transparent bg-charcoal hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]"
          : "border-border bg-white hover:border-transparent hover:shadow-[0_16px_48px_rgba(13,115,119,0.08),0_4px_12px_rgba(0,0,0,0.04)]"
      }`}
      data-reveal
    >
      <span
        className={`mb-5 inline-block w-fit rounded-[20px] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${
          highlight
            ? "bg-teal text-white"
            : "bg-teal-glow text-teal"
        }`}
      >
        {tag}
      </span>
      <h3
        className={`mb-3 text-[clamp(1.05rem,1.8vw,1.2rem)] font-bold leading-[1.35] tracking-tight ${
          highlight ? "text-white" : "text-charcoal"
        }`}
      >
        {title}
      </h3>
      <p
        className={`mb-5 max-w-none flex-1 text-[0.9rem] leading-[1.7] ${
          highlight ? "text-[rgba(232,232,240,0.65)]" : "text-slate"
        }`}
      >
        {description}
      </p>
      <span
        className={`mt-auto text-[0.75rem] font-semibold tracking-wide ${
          highlight ? "text-white/30" : "text-muted"
        }`}
      >
        {readTime}
      </span>
    </Link>
  );
}
