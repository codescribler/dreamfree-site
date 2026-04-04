interface MethodCardProps {
  number: number;
  title: string;
  description: string;
}

export function MethodCard({ number, title, description }: MethodCardProps) {
  return (
    <div
      className="rounded-2xl border border-border bg-white p-8 transition-all duration-400 ease-smooth hover:-translate-y-[3px] hover:border-transparent hover:shadow-[0_16px_48px_rgba(13,115,119,0.08),0_4px_12px_rgba(0,0,0,0.04)]"
      data-reveal
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
        {number}
      </span>
      <h3 className="mb-2 text-lg font-bold tracking-tight text-charcoal">
        {title}
      </h3>
      <p className="text-[0.95rem] leading-[1.7] text-slate">{description}</p>
    </div>
  );
}
