"use client";

import { useState, useEffect } from "react";

const COOKIE_NAME = "df_cookie_consent";

export type CookieConsent = "all" | "essential" | null;

export function getCookieConsent(): CookieConsent {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`),
  );
  const value = match?.[1];
  if (value === "all" || value === "essential") return value;
  return null;
}

function setConsentCookie(value: "all" | "essential") {
  document.cookie = `${COOKIE_NAME}=${value};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) {
      setVisible(true);
    }
  }, []);

  function accept(choice: "all" | "essential") {
    setConsentCookie(choice);
    setVisible(false);
    // Reload so analytics components pick up the new consent
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] animate-fade-in-up print:hidden">
      <div className="mx-auto max-w-[640px] px-4 pb-4">
        <div className="rounded-2xl border border-border bg-white px-6 py-5 shadow-[0_-4px_32px_rgba(0,0,0,0.08)]">
          <div className="mb-4">
            <p className="text-[0.85rem] leading-relaxed text-slate">
              <span className="mr-1.5 text-lg" role="img" aria-label="cookie">
                🍪
              </span>
              To appease the compliance gods, we have to tell you this site
              uses cookies. The essential ones keep things working. The
              analytics ones help us understand how people use the site so we
              can make it better.
            </p>
          </div>
          <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <button
              onClick={() => accept("all")}
              className="rounded-[60px] bg-teal px-5 py-2 text-[0.8rem] font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]"
            >
              Accept all
            </button>
            <button
              onClick={() => accept("essential")}
              className="rounded-[60px] border border-border bg-white px-5 py-2 text-[0.8rem] font-semibold text-slate transition-all duration-300 hover:text-charcoal"
            >
              Essential only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
