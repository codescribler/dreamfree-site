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
    <div className="flex items-center gap-2 max-md:gap-1">
      <button
        onClick={handlePrint}
        className="rounded-[60px] px-4 py-2 text-[0.85rem] font-medium text-slate transition-colors duration-300 hover:text-charcoal max-md:px-2 max-md:text-[0.78rem]"
      >
        Print Report
      </button>
      <button
        onClick={scrollToShare}
        className="rounded-[60px] px-4 py-2 text-[0.85rem] font-medium text-slate transition-colors duration-300 hover:text-charcoal max-md:px-2 max-md:text-[0.78rem]"
      >
        Share Report
      </button>
      <button
        onClick={scrollToCallback}
        className="rounded-[60px] bg-teal px-5 py-2 text-[0.85rem] font-semibold text-white transition-all duration-350 ease-spring hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)] max-md:px-3 max-md:text-[0.78rem]"
      >
        Free Report Review
      </button>
    </div>
  );
}
