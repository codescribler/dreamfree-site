interface PlanStepProps {
  number: number;
  title: string;
  description: string;
}

export function PlanStep({ number, title, description }: PlanStepProps) {
  return (
    <div
      className="group grid grid-cols-1 gap-4 border-t border-border py-12 transition-all duration-350 ease-smooth hover:pl-6 sm:grid-cols-[auto_1fr] sm:gap-12 [&:last-child]:border-b"
      data-reveal
    >
      <span className="min-w-[100px] text-[clamp(3rem,6vw,5rem)] font-black leading-none tracking-tighter text-teal opacity-25 transition-opacity duration-350 ease-smooth group-hover:opacity-60">
        {number}
      </span>
      <div>
        <h3 className="mb-3 text-[clamp(1.25rem,2.5vw,1.5rem)] font-bold tracking-tight text-charcoal">
          {title}
        </h3>
        <p className="max-w-[55ch] text-[0.95rem] leading-[1.75] text-slate">
          {description}
        </p>
      </div>
    </div>
  );
}
