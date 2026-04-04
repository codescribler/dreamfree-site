"use client";

import { useState } from "react";

interface CallbackModalProps {
  reportId: string;
  phone: string;
  onClose: () => void;
}

export function CallbackModal({
  reportId,
  phone: initialPhone,
  onClose,
}: CallbackModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center shadow-xl">
        {done ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
              <svg
                width="24"
                height="24"
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
            <h3 className="mb-2 text-lg font-bold text-charcoal">
              Request received
            </h3>
            <p className="mb-6 text-[0.9rem] text-slate">
              Daniel will be in touch shortly to arrange a time for your free
              report review call.
            </p>
            <button
              onClick={onClose}
              className="rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-lg font-bold text-charcoal">
              Request a free report review call
            </h3>
            <p className="mb-6 text-[0.9rem] text-slate">
              Is this the best number to contact you on?
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone number"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-lg text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
                disabled={loading}
              />
              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="mt-4 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading ? "Sending request..." : "Request Call"}
              </button>
            </form>
            <button
              onClick={onClose}
              className="mt-3 text-xs text-muted transition-colors hover:text-charcoal"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
