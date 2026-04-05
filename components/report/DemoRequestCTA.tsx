"use client";

import { useState } from "react";

interface DemoRequestCTAProps {
  reportId: string;
}

export function DemoRequestCTA({ reportId }: DemoRequestCTAProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleRequest() {
    setStatus("loading");

    try {
      const res = await fetch(`/api/report/${reportId}/demo-request`, {
        method: "POST",
      });

      const data = await res.json();

      if (data.success) {
        setStatus("done");
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div
        className="mb-10 rounded-2xl border border-teal/20 bg-teal/5 p-8 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal/10">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            className="text-teal"
          >
            <path
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-charcoal">
          You&rsquo;re on the list
        </h2>
        <p className="text-[0.95rem] leading-relaxed text-slate">
          Daniel will be in touch shortly to discuss your report and start
          designing your new homepage. Keep an eye on your inbox.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mb-10 rounded-2xl border-2 border-teal/30 bg-gradient-to-b from-teal/5 to-white p-8 text-center"
    >
      <span className="mb-3 inline-block text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-teal">
        Free &mdash; No Obligation
      </span>
      <h2 className="mb-3 text-[clamp(1.25rem,3vw,1.5rem)] font-extrabold tracking-tight text-charcoal">
        Want to see what your homepage
        <br />
        <em className="font-serif font-bold italic text-teal">
          could look like?
        </em>
      </h2>
      <p className="mx-auto mb-6 max-w-[50ch] text-[0.95rem] leading-relaxed text-slate">
        We&rsquo;ll redesign your homepage using The Signal Method &mdash;
        new messaging, new layout, built around the fixes in your report.
        Completely free. No commitment. You&rsquo;ll see the difference
        before you spend a penny.
      </p>
      <button
        onClick={handleRequest}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3.5 text-[0.95rem] font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "loading" ? (
          "Requesting..."
        ) : (
          <>
            Show Me What My Homepage Could Look Like
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="shrink-0"
            >
              <path
                d="M4 10h12m0 0l-4-4m4 4l-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      <p className="mt-4 text-[0.8rem] text-muted">
        No phone call required. No sales pitch. Just a redesigned homepage
        in your inbox.
      </p>
    </div>
  );
}
