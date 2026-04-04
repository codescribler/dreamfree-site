interface ServiceCardProps {
  tag: string;
  title: string;
  description: string;
  hero?: boolean;
}

export function ServiceCard({
  tag,
  title,
  description,
  hero = false,
}: ServiceCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-400 ease-smooth ${
        hero
          ? "justify-center border-transparent bg-charcoal p-12 text-[rgba(232,232,240,0.8)] md:row-span-2 hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]"
          : "border-border bg-white hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_12px_40px_rgba(13,115,119,0.07),0_2px_8px_rgba(0,0,0,0.03)]"
      }`}
      data-reveal
    >
      <span
        className={`mb-4 inline-block w-fit rounded-[20px] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${
          hero
            ? "bg-teal text-white"
            : "bg-teal-glow text-teal"
        }`}
      >
        {tag}
      </span>
      <h3
        className={`mb-3 font-bold tracking-tight ${
          hero
            ? "text-[1.75rem] text-white"
            : "text-[clamp(1.1rem,2vw,1.3rem)] text-charcoal"
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-[0.95rem] leading-[1.7] ${
          hero ? "text-[rgba(232,232,240,0.75)]" : "text-slate"
        }`}
      >
        {description}
      </p>
    </div>
  );
}
