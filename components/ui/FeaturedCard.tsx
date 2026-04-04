import Link from "next/link";

interface FeaturedCardProps {
  href: string;
  tag: string;
  title: string;
  description: string;
  readTime: string;
}

export function FeaturedCard({
  href,
  tag,
  title,
  description,
  readTime,
}: FeaturedCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-6 rounded-2xl border border-border bg-white p-8 transition-all duration-400 ease-smooth hover:-translate-y-1 hover:border-transparent hover:shadow-[0_16px_48px_rgba(13,115,119,0.08),0_4px_12px_rgba(0,0,0,0.04)] md:flex-row md:items-center"
      data-reveal
    >
      <div className="flex-1">
        <span className="mb-3 inline-block rounded-[20px] bg-teal-glow px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-teal">
          {tag}
        </span>
        <h3 className="mb-3 text-xl font-bold tracking-tight text-charcoal group-hover:text-teal md:text-2xl">
          {title}
        </h3>
        <p className="mb-4 text-[0.9rem] leading-[1.7] text-slate">
          {description}
        </p>
        <span className="text-[0.75rem] font-semibold tracking-wide text-muted">
          {readTime}
        </span>
      </div>
      <div className="h-48 w-full shrink-0 rounded-[10px] bg-warm-grey md:h-40 md:w-64" />
    </Link>
  );
}
