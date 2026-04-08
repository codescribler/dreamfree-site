import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "404 — Page Not Found",
};

export default function NotFound() {
  return (
    <section className="relative flex min-h-[80dvh] items-center overflow-hidden px-[clamp(1.25rem,4vw,3rem)] py-20">
      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute top-[15%] left-[10%] h-[340px] w-[340px] rounded-full opacity-0 blur-[100px] animate-blob-fade-in animate-blob-1"
          style={{ background: "rgba(13, 115, 119, 0.08)" }}
        />
        <div
          className="absolute right-[8%] bottom-[20%] h-[280px] w-[280px] rounded-full opacity-0 blur-[90px] animate-blob-fade-in animate-blob-2"
          style={{
            background: "rgba(13, 115, 119, 0.06)",
            animationDelay: "0.3s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[860px] text-center">
        {/* Animated signal bars — losing signal */}
        <div
          className="mx-auto mb-10 flex items-end justify-center gap-[6px]"
          aria-hidden="true"
        >
          <span className="signal-bar signal-bar-1" />
          <span className="signal-bar signal-bar-2" />
          <span className="signal-bar signal-bar-3" />
          <span className="signal-bar signal-bar-4" />
          <span className="signal-bar signal-bar-5" />
        </div>

        {/* 404 number — massive, ghostly */}
        <p
          className="mb-2 font-sans text-[clamp(6rem,20vw,14rem)] font-black leading-none tracking-tighter text-charcoal/[0.04] select-none"
          style={{ animationDelay: "0.1s" }}
        >
          404
        </p>

        {/* Headline */}
        <h1
          className="mb-4 -mt-8 text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
          Well, this is awkward.
        </h1>

        {/* Subhead */}
        <p
          className="mx-auto mb-8 max-w-[50ch] font-serif text-[clamp(1.1rem,2.2vw,1.5rem)] italic text-teal animate-fade-in-up"
          style={{ animationDelay: "0.35s" }}
        >
          This page isn&rsquo;t generating leads either.
        </p>

        {/* Body */}
        <div
          className="mx-auto mb-12 max-w-[55ch] animate-fade-in-up"
          style={{ animationDelay: "0.5s" }}
        >
          <p className="text-[clamp(1rem,1.6vw,1.1rem)] leading-[1.75] text-slate">
            Looks like this page has gone missing&thinsp;&mdash;&thinsp;a bit
            like the customers slipping through a website that doesn&rsquo;t
            convert. The good news? We can fix that.
          </p>
          <p className="mt-1 text-[0.9rem] text-muted">
            (The website part, anyway. This page is beyond saving.)
          </p>
        </div>

        {/* CTAs */}
        <div
          className="flex flex-wrap items-center justify-center gap-5 animate-fade-in-up max-[480px]:flex-col"
          style={{ animationDelay: "0.65s" }}
        >
          <Button href="/">Take me home</Button>
          <Button variant="ghost" href="/the-signal-method">
            See how we fix websites
          </Button>
        </div>

        {/* Helpful links */}
        <nav
          className="mt-14 animate-fade-in-up"
          style={{ animationDelay: "0.8s" }}
          aria-label="Helpful pages"
        >
          <p className="mb-4 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Or try one of these
          </p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[0.95rem]">
            <Link
              href="/services"
              className="border-b border-transparent font-medium text-charcoal transition-all duration-300 ease-smooth hover:border-teal hover:text-teal"
            >
              Services
            </Link>
            <Link
              href="/learning-centre"
              className="border-b border-transparent font-medium text-charcoal transition-all duration-300 ease-smooth hover:border-teal hover:text-teal"
            >
              Learning Centre
            </Link>
            <Link
              href="/free-tools"
              className="border-b border-transparent font-medium text-charcoal transition-all duration-300 ease-smooth hover:border-teal hover:text-teal"
            >
              Free Tools
            </Link>
            <Link
              href="/contact"
              className="border-b border-transparent font-medium text-charcoal transition-all duration-300 ease-smooth hover:border-teal hover:text-teal"
            >
              Contact
            </Link>
          </div>
        </nav>
      </div>
    </section>
  );
}
