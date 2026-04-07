interface StrengthCardProps {
  name: string;
  score: number;
  summary: string;
}

export function StrengthCard({ name, score, summary }: StrengthCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor = score <= 8 ? "bg-teal" : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-teal/15 bg-teal-glow/50 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-semibold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-teal-deep">{score}/10</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/50">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-[0.95rem] leading-[1.6] text-slate">{summary}</p>
    </div>
  );
}
