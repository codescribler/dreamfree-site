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
          <Link href="/" className="group flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate transition-colors group-hover:text-teal">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
            <Image
              src="/images/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-auto max-sm:hidden"
              priority
            />
            <span className="text-[0.85rem] font-medium text-slate transition-colors group-hover:text-charcoal sm:text-[1.15rem] sm:font-bold sm:tracking-tight sm:text-charcoal">
              <span className="sm:hidden">Home</span>
              <span className="hidden sm:inline">Dreamfree</span>
            </span>
          </Link>

          <ReportNav />
        </nav>
      </header>
      {children}
    </>
  );
}
