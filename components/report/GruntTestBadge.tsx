interface GruntTestBadgeProps {
  pass: boolean;
  explanation: string;
}

export function GruntTestBadge({ pass, explanation }: GruntTestBadgeProps) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        pass
          ? "border-teal/20 bg-teal-glow"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            pass
              ? "bg-teal/10 text-teal-deep"
              : "bg-red-100 text-red-600"
          }`}
        >
          {pass ? "PASSED" : "FAILED"}
        </span>
        <span className="text-sm font-bold text-charcoal">
          The Grunt Test
        </span>
      </div>
      <p className="text-[0.95rem] leading-[1.6] text-slate">
        {explanation}
      </p>
      <p className="mt-2 text-[0.875rem] italic text-muted">
        Can a visitor answer these 3 questions within 5 seconds: What do you
        offer? How will it make my life better? What do I need to do to buy it?
      </p>
    </div>
  );
}
