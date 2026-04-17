import Image from "next/image";
import Link from "next/link";
import { ReportNav } from "@/components/report/ReportNav";

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Report-specific header replaces the global Header */}
      <style>{`header:has(nav[aria-label="Main navigation"]) { display: none !important; }`}</style>
      <header className="fixed top-0 right-0 left-0 z-50 bg-cream/85 px-[clamp(1.25rem,4vw,3rem)] py-4 shadow-[0_1px_0_var(--color-border),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-[20px] backdrop-saturate-[1.4] print:hidden">
        <nav
          className="mx-auto flex h-14 max-w-[1340px] items-center justify-between"
          aria-label="Report navigation"
        >
          <Link
            href="/"
            className="group flex items-center gap-1.5 rounded-[60px] border border-border bg-white/60 px-3 py-2 text-[0.85rem] font-medium text-slate transition-all duration-300 hover:-translate-y-0.5 hover:border-teal hover:text-charcoal hover:shadow-[0_4px_14px_rgba(13,115,119,0.12)] sm:gap-2 sm:px-4"
            aria-label="Back to Dreamfree home"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform duration-300 group-hover:-translate-x-0.5">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
            <Image
              src="/images/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-6 w-auto max-sm:hidden"
              priority
            />
            <span>
              <span className="sm:hidden">Back</span>
              <span className="hidden sm:inline">Back to Dreamfree</span>
            </span>
          </Link>

          <ReportNav />
        </nav>
      </header>
      {children}
    </>
  );
}
