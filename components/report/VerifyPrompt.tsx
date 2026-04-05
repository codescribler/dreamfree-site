"use client";

import { useState } from "react";

interface VerifyPromptProps {
  reportId: string;
}

export function VerifyPrompt({ reportId }: VerifyPromptProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.reload();
        return;
      }

      setError(data.message || "Invalid code. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim() || !resendEmail.includes("@")) return;
    setResendError("");
    setResendLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setResendDone(true);
      } else {
        setResendError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setResendError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div
      className="mb-10 rounded-2xl border border-amber-300/40 bg-amber-50 p-8 text-center"
      data-reveal
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-amber-600"
        >
          <path
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Your full report is ready to unlock
      </h3>
      <p className="mb-2 text-[0.9rem] leading-relaxed text-slate">
        We&rsquo;ve just sent you an email with a link to view your complete
        breakdown — including detailed analysis, business impact, and
        personalised recommendations for every element.
      </p>
      <p className="mb-6 text-[0.85rem] font-medium text-amber-700">
        Check your inbox and click the link to unlock everything.
      </p>

      {/* Code entry */}
      <div className="mx-auto max-w-xs">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate">
          Or enter your 6-digit code
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter 6-digit code"
            className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-charcoal placeholder:text-muted placeholder:tracking-normal focus:border-teal focus:outline-none"
            disabled={loading}
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="mt-3 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {loading ? "Verifying..." : "Unlock Report"}
          </button>
        </form>
      </div>

      {/* Resend / fix email */}
      <div className="mt-4">
        {!showResend && (
          <button
            onClick={() => setShowResend(true)}
            className="text-xs font-medium text-teal transition-colors hover:text-teal-deep"
          >
            Didn&rsquo;t get the email? Resend or change your email address
          </button>
        )}

        {showResend && !resendDone && (
          <form onSubmit={handleResend} className="mx-auto mt-3 max-w-xs">
            <p className="mb-3 text-[0.8rem] text-slate">
              Enter your email and we&rsquo;ll send a new link and code:
            </p>
            <input
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="Your email address"
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-center text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
              disabled={resendLoading}
            />
            {resendError && (
              <p className="mt-2 text-sm text-red-500">{resendError}</p>
            )}
            <button
              type="submit"
              disabled={
                resendLoading ||
                !resendEmail.trim() ||
                !resendEmail.includes("@")
              }
              className="mt-3 w-full rounded-[60px] border border-teal bg-white px-6 py-2.5 text-xs font-semibold text-teal transition-all duration-300 hover:bg-teal hover:text-white disabled:opacity-50"
            >
              {resendLoading ? "Sending..." : "Send New Link"}
            </button>
          </form>
        )}

        {resendDone && (
          <p className="mt-3 text-sm font-medium text-teal">
            New link and code sent to {resendEmail}. Check your inbox.
          </p>
        )}
      </div>
    </div>
  );
}
