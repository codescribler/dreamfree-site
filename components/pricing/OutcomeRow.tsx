interface OutcomeRowProps {
  outcome: string;
  what: string;
  addsMonthly: string;
}

export function OutcomeRow({ outcome, what, addsMonthly }: OutcomeRowProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 border-b border-border py-6 last:border-b-0 md:grid-cols-[1.3fr_1fr_auto] md:items-start md:gap-6"
      data-reveal
    >
      <div className="text-[1.05rem] font-semibold italic text-charcoal">
        &ldquo;{outcome}&rdquo;
      </div>
      <p className="text-[0.95rem] leading-relaxed text-slate">{what}</p>
      <div className="text-[0.95rem] font-semibold whitespace-nowrap text-teal md:text-right">
        {addsMonthly}
      </div>
    </div>
  );
}
