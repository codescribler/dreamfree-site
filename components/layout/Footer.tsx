import Image from "next/image";
import Link from "next/link";
import { SITE, NAV_LINKS } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-offblack px-[clamp(1.25rem,4vw,3rem)] pt-16 pb-8 text-[rgba(232,232,240,0.6)]">
      <div className="mx-auto max-w-[1340px]">
        {/* Top: Brand + Link columns */}
        <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-[1fr_2fr] md:gap-16">
          {/* Brand column */}
          <div>
            <Image
              src="/images/logo.png"
              alt="Dreamfree"
              width={28}
              height={28}
              className="mb-4 h-7 w-auto opacity-70"
            />
            <p className="text-[0.9rem] leading-relaxed">
              &ldquo;A website is more than a brochure with buttons.
              <br />
              It&rsquo;s the beginning of a conversation.&rdquo;
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {/* Navigation */}
            <div>
              <h4 className="mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/40">
                Navigation
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    href="/"
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    Home
                  </Link>
                </li>
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Free Tools */}
            <div>
              <h4 className="mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/40">
                Free Tools
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <Link
                    href="/free-tools"
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    All Free Tools
                  </Link>
                </li>
                <li>
                  <button
                    data-modal="signal-flow"
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    Signal Score
                  </button>
                </li>
                <li>
                  <Link
                    href="/learning-centre/content-marketing-ideas"
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    Content Idea Generator
                  </Link>
                </li>
                <li>
                  <Link
                    href="/free-demo"
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    Free Demo Homepage
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/40">
                Get in Touch
              </h4>
              <ul className="space-y-2.5">
                <li>
                  <a
                    href={SITE.phoneTel}
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    {SITE.phone}
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${SITE.email}`}
                    className="text-[0.9rem] transition-colors duration-300 ease-smooth hover:text-teal-bright"
                  >
                    {SITE.email}
                  </a>
                </li>
                <li className="text-[0.9rem]">{SITE.location}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-2 border-t border-white/[0.06] pt-8 text-[0.8rem] text-[rgba(232,232,240,0.3)] sm:flex-row sm:items-center">
          <span>
            Built by Dreamfree &middot;{" "}
            <a
              href="https://dreamfree.co.uk"
              className="transition-colors duration-300 ease-smooth hover:text-teal-bright"
              rel="noopener"
            >
              dreamfree.co.uk
            </a>
          </span>
          <span className="flex items-center gap-3">
            <Link
              href="/privacy"
              className="transition-colors duration-300 ease-smooth hover:text-teal-bright"
            >
              Privacy Policy
            </Link>
            <span>&middot;</span>
            &copy; {new Date().getFullYear()} Dreamfree
          </span>
        </div>
      </div>
    </footer>
  );
}
