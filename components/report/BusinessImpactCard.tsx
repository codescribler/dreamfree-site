interface BusinessImpactCardProps {
  name: string;
  score: number;
  businessImpact: string;
  analysis: string;
}

export function BusinessImpactCard({
  name,
  score,
  businessImpact,
  analysis,
}: BusinessImpactCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor =
    score <= 3
      ? "bg-red-400"
      : score <= 6
        ? "bg-amber-400"
        : "bg-teal";

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-charcoal">{score}/10</span>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-warm-grey">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="mb-4 text-[0.95rem] font-medium leading-[1.6] text-red-600/80">
        {businessImpact}
      </p>

      <div className="space-y-2 text-[0.95rem] leading-[1.7] text-slate">
        {analysis.split("\n\n").map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </div>
  );
}
