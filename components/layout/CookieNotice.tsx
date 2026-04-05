"use client";

import { useState, useEffect } from "react";

const COOKIE_NAME = "df_cookies_ok";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!document.cookie.includes(COOKIE_NAME)) {
      setVisible(true);
    }
  }, []);

  function accept() {
    document.cookie = `${COOKIE_NAME}=1;path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] animate-fade-in-up print:hidden">
      <div className="mx-auto max-w-[640px] px-4 pb-4">
        <div className="rounded-2xl border border-border bg-white px-6 py-4 shadow-[0_-4px_32px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-4 max-sm:flex-col max-sm:text-center">
            <div className="flex-1">
              <p className="text-[0.85rem] leading-relaxed text-slate">
                <span className="mr-1.5 text-lg" role="img" aria-label="cookie">
                  🍪
                </span>
                To appease the compliance department, we have to tell you this
                site uses cookies. They&rsquo;re mostly harmless — just helping
                us remember you and keep things running smoothly.
              </p>
            </div>
            <button
              onClick={accept}
              className="shrink-0 rounded-[60px] bg-teal px-5 py-2 text-[0.8rem] font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]"
            >
              Fair enough
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
