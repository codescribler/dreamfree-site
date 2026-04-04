interface ArticleHeaderProps {
  tag: string;
  title: string;
  readTime: string;
  date: string;
}

export function ArticleHeader({
  tag,
  title,
  readTime,
  date,
}: ArticleHeaderProps) {
  return (
    <header className="px-[clamp(1.25rem,4vw,3rem)] pb-12 pt-40 text-center">
      <div className="mx-auto max-w-[720px]">
        <span className="mb-4 inline-block rounded-[20px] bg-teal-glow px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-teal">
          {tag}
        </span>
        <h1 className="text-[clamp(1.75rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-charcoal">
          {title}
        </h1>
        <div className="mt-6 flex items-center justify-center gap-4 text-[0.82rem] font-medium text-muted">
          <span>{readTime}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-border" />
          <time dateTime={date}>
            {new Date(date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>
      </div>
    </header>
  );
}
