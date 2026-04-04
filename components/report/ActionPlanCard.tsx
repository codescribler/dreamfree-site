interface ActionPlanCardProps {
  name: string;
  recommendations: string[];
}

export function ActionPlanCard({
  name,
  recommendations,
}: ActionPlanCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-teal-glow p-6">
      <h3 className="mb-3 text-[0.95rem] font-bold text-charcoal">{name}</h3>
      <ol className="space-y-3">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
              {i + 1}
            </span>
            <p className="text-[0.85rem] leading-[1.6] text-slate">{rec}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
