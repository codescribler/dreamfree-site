interface PriceAnchorCardProps {
  kicker: string;
  figure: string;
  unit: string;
  rangeNote: string;
}

export function PriceAnchorCard({
  kicker,
  figure,
  unit,
  rangeNote,
}: PriceAnchorCardProps) {
  return (
    <div
      className="rounded-3xl border border-border bg-white/70 p-8 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_32px_rgba(16,24,40,0.06)] backdrop-blur-sm"
      data-reveal
    >
      <div className="mb-3 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-teal">
        {kicker}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[clamp(2.5rem,6vw,4rem)] font-extrabold tracking-tighter text-charcoal">
          {figure}
        </span>
        <span className="text-[1rem] font-medium text-slate">{unit}</span>
      </div>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
        {rangeNote}
      </p>
    </div>
  );
}
