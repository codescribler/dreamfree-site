interface TakeawayBoxProps {
  children: React.ReactNode;
}

export function TakeawayBox({ children }: TakeawayBoxProps) {
  return (
    <div className="my-12 rounded-2xl border border-teal/15 bg-[rgba(13,115,119,0.05)] p-8">
      <h3 className="mb-3 text-[0.8rem] font-bold uppercase tracking-[0.1em] text-teal">
        Your #1 Takeaway
      </h3>
      <div className="text-base font-medium leading-[1.7] text-charcoal [&>p]:mb-0 [&>p]:max-w-none">
        {children}
      </div>
    </div>
  );
}
