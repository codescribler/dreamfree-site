"use client";

import { useState, useEffect, useCallback, useReducer } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/constants";

type NavState = { scrolled: boolean; linksRevealed: boolean };
type NavAction =
  | { type: "scroll"; scrollY: number; isHomepage: boolean }
  | { type: "navigate"; isHomepage: boolean };

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "scroll": {
      const past = action.scrollY > 20;
      return {
        scrolled: past,
        linksRevealed: state.linksRevealed || (past && action.isHomepage),
      };
    }
    case "navigate":
      // Reset reveal state when arriving at homepage
      return action.isHomepage
        ? { ...state, linksRevealed: false }
        : state;
    default:
      return state;
  }
}

export function Header() {
  const [{ scrolled, linksRevealed }, dispatch] = useReducer(navReducer, {
    scrolled: false,
    linksRevealed: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHomepage = pathname === "/";

  // Non-homepage: links always visible. Homepage: revealed after first scroll.
  const linksVisible = !isHomepage || linksRevealed;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    dispatch({ type: "navigate", isHomepage });

    const onScroll = () => {
      dispatch({ type: "scroll", scrollY: window.scrollY, isHomepage });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHomepage]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuOpen) setMenuOpen(false);
    },
    [menuOpen]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 px-[clamp(1.25rem,4vw,3rem)] py-4 transition-all duration-400 ease-smooth ${
        scrolled
          ? "bg-cream/85 shadow-[0_1px_0_var(--color-border),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-[20px] backdrop-saturate-[1.4]"
          : "bg-transparent"
      }`}
    >
      <nav
        className="mx-auto flex h-14 max-w-[1340px] items-center justify-between"
        aria-label="Main navigation"
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/images/logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-auto"
            priority
          />
          <span className="text-[1.15rem] font-bold tracking-tight text-charcoal">
            Dreamfree
          </span>
        </Link>

        {/* Desktop nav + mobile overlay */}
        <div
          className={`${
            menuOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          } fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-cream transition-opacity duration-400 ease-smooth md:pointer-events-auto md:relative md:inset-auto md:flex md:flex-row md:items-center md:gap-10 md:bg-transparent md:opacity-100`}
        >
          <ul className="flex flex-col items-center gap-6 md:flex-row md:gap-8">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className={`relative text-[0.9rem] font-medium transition-colors duration-300 ease-smooth after:absolute after:-bottom-1 after:left-0 after:h-[1.5px] after:bg-teal after:transition-[width] after:duration-300 after:ease-smooth hover:text-charcoal hover:after:w-full ${
                      isActive
                        ? "text-charcoal after:w-full"
                        : "text-slate after:w-0"
                    } ${
                      linksVisible ? "md:opacity-100" : "md:opacity-0"
                    } max-md:text-2xl max-md:font-semibold max-md:text-charcoal max-md:opacity-100 md:transition-[color,opacity] md:duration-500`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <button
            className="rounded-[60px] bg-teal px-6 py-2.5 text-[0.85rem] font-semibold text-white transition-all duration-350 ease-spring hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]"
            data-modal="signal-flow"
          >
            Grade My Site
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          <span
            className={`block h-0.5 w-[22px] rounded-full bg-charcoal transition-all duration-350 ease-smooth ${
              menuOpen
                ? "translate-y-[4px] rotate-45"
                : ""
            }`}
          />
          <span
            className={`block h-0.5 w-[22px] rounded-full bg-charcoal transition-all duration-350 ease-smooth ${
              menuOpen
                ? "-translate-y-[4px] -rotate-45"
                : ""
            }`}
          />
        </button>
      </nav>
    </header>
  );
}
