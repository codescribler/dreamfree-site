"use client";

interface ElementPreviewProps {
  elements: [
    string,
    {
      score: number;
      summary: string;
      recommendationCount: number;
      hasAnalysis: boolean;
    },
  ][];
  names: Record<string, string>;
  url: string;
}

export function ElementPreview({ elements, names }: ElementPreviewProps) {
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
              className="overflow-hidden rounded-xl border border-border bg-white px-5 py-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.95rem] font-semibold text-charcoal">
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
              <p className="text-[0.875rem] leading-[1.5] text-muted">
                {el.summary}
              </p>

              {/* Locked content hints */}
              <div className="mt-3 border-t border-border/50 pt-3">
                <div className="flex select-none flex-col gap-1.5">
                  {/* Blurred analysis teaser */}
                  <div className="relative overflow-hidden rounded-lg bg-warm-grey/50 px-3 py-2">
                    <p className="text-[0.75rem] leading-relaxed text-slate blur-[4px]">
                      This element needs attention because your messaging
                      doesn&rsquo;t clearly communicate the value proposition
                      to visitors within the first few seconds of landing.
                    </p>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[0.7rem] font-semibold text-amber-700 shadow-sm">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Full analysis locked
                      </span>
                    </div>
                  </div>

                  {/* Recommendation count hint */}
                  {el.recommendationCount > 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-teal/5 px-3 py-2">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-teal"
                      >
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      <span className="text-[0.75rem] font-medium text-teal-deep">
                        {el.recommendationCount} personalised{" "}
                        {el.recommendationCount === 1
                          ? "recommendation"
                          : "recommendations"}{" "}
                        waiting for you
                      </span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="ml-auto shrink-0 text-amber-500"
                      >
                        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
