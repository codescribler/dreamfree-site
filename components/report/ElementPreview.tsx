"use client";

interface ElementPreviewProps {
  elements: [string, { score: number; summary: string }][];
  names: Record<string, string>;
  url: string;
}

export function ElementPreview({ elements, names, url }: ElementPreviewProps) {
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="my-10" data-reveal>
      <h2 className="mb-6 text-lg font-bold text-charcoal">
        Your 7-element breakdown
      </h2>
      <div className="space-y-3">
        {elements.map(([key, el]) => {
          const barWidth = (el.score / 10) * 100;
          const barColor =
            el.score <= 3
              ? "bg-red-400"
              : el.score <= 6
                ? "bg-amber-400"
                : el.score <= 8
                  ? "bg-teal"
                  : "bg-emerald-500";

          return (
            <div
              key={key}
              className="rounded-xl border border-border bg-white px-5 py-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.9rem] font-semibold text-charcoal">
                  {names[key] || key}
                </span>
                <span className="text-sm font-bold text-charcoal">
                  {el.score}/10
                </span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-warm-grey">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="text-[0.8rem] leading-[1.5] text-muted">
                {el.summary}
              </p>
            </div>
          );
        })}
      </div>

      {/* Blurred overlay teaser */}
      <div className="relative mt-4 overflow-hidden rounded-2xl">
        <div className="select-none blur-[6px]">
          <div className="space-y-3 p-4">
            <div className="rounded-xl bg-warm-grey p-5">
              <p className="text-sm text-slate">
                Detailed analysis of each element with specific recommendations
                tailored to your website content and messaging structure.
              </p>
            </div>
            <div className="rounded-xl bg-teal-glow p-5">
              <p className="text-sm text-slate">
                Your personalised action plan with step-by-step fixes to improve
                your messaging and convert more visitors into customers.
              </p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="mb-3 text-teal"
          >
            <path
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-center text-sm font-semibold text-charcoal">
            Unlock your 7 personalised recommendations
          </p>
          <p className="mt-1 text-center text-xs text-muted">
            tailored specifically to{" "}
            <span className="font-semibold text-teal">{displayUrl}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
