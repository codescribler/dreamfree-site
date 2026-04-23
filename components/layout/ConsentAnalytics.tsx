"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { getCookieConsent } from "./CookieNotice";
import { SITE } from "@/lib/constants";

export function ConsentAnalytics() {
  const [consented, setConsented] = useState(false);
  const [optedOut, setOptedOut] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let paramsChanged = false;
    if (params.has("no-track")) {
      localStorage.setItem("df_track", "off");
      params.delete("no-track");
      paramsChanged = true;
    } else if (params.has("track")) {
      localStorage.removeItem("df_track");
      params.delete("track");
      paramsChanged = true;
    }
    if (paramsChanged) {
      const qs = params.toString();
      const newUrl =
        window.location.pathname +
        (qs ? `?${qs}` : "") +
        window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }

    setOptedOut(localStorage.getItem("df_track") === "off");
    setConsented(getCookieConsent() === "all");
  }, []);

  if (optedOut || !consented) return null;

  return (
    <>
      <Script id="ms-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${SITE.clarityId}");`}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${SITE.gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${SITE.gaId}');`}
      </Script>
      <Analytics />
    </>
  );
}
