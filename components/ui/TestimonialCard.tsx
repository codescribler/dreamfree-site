interface TestimonialCardProps {
  quote: string;
  author: string;
  role: string;
}

export function TestimonialCard({
  quote,
  author,
  role,
}: TestimonialCardProps) {
  return (
    <div
      className="flex flex-col justify-between rounded-2xl border border-border bg-white p-10 transition-all duration-400 ease-smooth hover:-translate-y-[3px] hover:border-transparent hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
      data-reveal
    >
      <div>
        {/* Quote mark */}
        <svg
          className="mb-4 h-8 w-10 text-teal"
          viewBox="0 0 40 32"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 0C5.4 0 0 5.4 0 12v20h16V16H6c0-3.3 2.7-6 6-6V0zm22 0c-6.6 0-12 5.4-12 12v20h16V16h-10c0-3.3 2.7-6 6-6V0z" />
        </svg>
        <p className="text-[1.05rem] leading-[1.8] text-slate">{quote}</p>
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <strong className="block text-[0.95rem] text-charcoal">{author}</strong>
        {role && <span className="text-[0.8rem] text-muted">{role}</span>}
      </div>
    </div>
  );
}
