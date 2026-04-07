"use client";

interface ReportActionsProps {
  reportUrl: string;
  score: number;
}

export function ReportActions({ reportUrl, score }: ReportActionsProps) {
  const shareText =
    score >= 60
      ? `My website scored ${score}/100 on the Signal Score — a messaging audit by Dreamfree, built on The Signal Method.`
      : `Just got my website messaging audited by Dreamfree using The Signal Method — scored ${score}/100.`;

  const encodedUrl = encodeURIComponent(reportUrl);
  const encodedText = encodeURIComponent(shareText);

  function handlePrint() {
    window.print();
  }

  function scrollToShare() {
    const el = document.getElementById("share-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const input = el.querySelector("input");
        input?.focus();
      }, 500);
    }
  }

  function openPopup(url: string) {
    window.open(url, "_blank", "width=600,height=500,noopener,noreferrer");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm print:hidden">
      <div className="mx-auto flex max-w-[800px] items-center justify-center gap-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PDF
        </button>

        <button
          onClick={scrollToShare}
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Share by Email
        </button>

        <button
          onClick={() =>
            openPopup(
              `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            )
          }
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          LinkedIn
        </button>

        <button
          onClick={() =>
            openPopup(
              `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
            )
          }
          className="inline-flex items-center gap-2 rounded-[60px] border border-border bg-white px-4 py-2 text-xs font-semibold text-charcoal transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post on X
        </button>
      </div>
    </div>
  );
}
