"use client";

export function ReportNav() {
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

  function scrollToCallback() {
    const el = document.querySelector("[data-report-cta]");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 rounded-[60px] px-3 py-2 text-[0.85rem] font-medium text-slate transition-colors duration-300 hover:text-charcoal sm:px-4"
        aria-label="Print Report"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M6 9V2h12v7" />
          <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        <span className="hidden sm:inline">Print</span>
      </button>
      <button
        onClick={scrollToShare}
        className="flex items-center gap-1.5 rounded-[60px] px-3 py-2 text-[0.85rem] font-medium text-slate transition-colors duration-300 hover:text-charcoal sm:px-4"
        aria-label="Share Report"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="hidden sm:inline">Share</span>
      </button>
      <button
        onClick={scrollToCallback}
        className="flex items-center gap-1.5 rounded-[60px] bg-teal px-3 py-2 text-[0.8rem] font-semibold text-white transition-all duration-350 ease-spring hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)] sm:px-5 sm:text-[0.85rem]"
        aria-label="Free Report Review"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 sm:hidden">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
        <span className="max-[399px]:hidden">Free Review</span>
      </button>
    </div>
  );
}
