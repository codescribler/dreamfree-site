interface ElementCardProps {
  name: string;
  score: number;
  summary: string;
  analysis?: string;
  recommendation?: string;
}

export function ElementCard({
  name,
  score,
  summary,
  analysis,
  recommendation,
}: ElementCardProps) {
  const barWidth = (score / 10) * 100;
  const barColor =
    score <= 3
      ? "bg-red-400"
      : score <= 6
        ? "bg-amber-400"
        : score <= 8
          ? "bg-teal"
          : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-bold text-charcoal">{name}</h3>
        <span className="text-sm font-bold text-charcoal">{score}/10</span>
      </div>

      {/* Score bar */}
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-warm-grey">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="text-[0.9rem] leading-[1.6] text-slate">{summary}</p>

      {recommendation && (
        <div className="mt-4 rounded-xl bg-teal-glow p-4">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-teal-deep">
            Recommendation
          </h4>
          <p className="text-[0.85rem] leading-[1.6] text-slate">
            {recommendation}
          </p>
        </div>
      )}

      {analysis && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Detailed Analysis
          </h4>
          <div className="space-y-2 text-[0.85rem] leading-[1.7] text-slate">
            {analysis.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
