"use client";

import { useState } from "react";

interface ShareFormProps {
  reportId: string;
  sharerName: string;
  sharerEmail: string;
  score: number;
}

export function ShareForm({
  reportId,
  sharerName,
  sharerEmail,
  score,
}: ShareFormProps) {
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emails.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/report/${reportId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: emails.trim(),
          message: message.trim() || undefined,
          sharerName,
          sharerEmail,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: data.message });
        setEmails("");
        setMessage("");
      } else {
        setError(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      id="share-form"
      className="mt-10 rounded-2xl border border-border bg-warm-grey p-8 print:hidden"
      data-reveal
    >
      {score >= 60 && (
        <div className="mb-4 rounded-xl bg-teal/10 px-5 py-3 text-center">
          <p className="text-sm font-semibold text-teal-deep">
            Your site scored above average &mdash; share the good news!
          </p>
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold text-charcoal">
        Share this report
      </h2>
      <p className="mb-6 text-[0.85rem] text-muted">
        Send the full report to a colleague, business partner, or marketing
        team. They&rsquo;ll get an email with a link to view everything you can
        see here.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="share-emails"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate"
          >
            Email addresses
          </label>
          <input
            id="share-emails"
            type="text"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="partner@example.com, marketing@example.com"
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted/50 focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            Separate multiple addresses with commas.
          </p>
        </div>

        <div>
          <label
            htmlFor="share-message"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate"
          >
            Message (optional)
          </label>
          <textarea
            id="share-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Take a look at our website audit..."
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted/50 focus:border-teal focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !emails.trim()}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-6 py-2.5 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? "Sending..." : "Share Report"}
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {result?.success && (
          <p className="text-sm font-medium text-teal-deep">
            {result.message}
          </p>
        )}
      </form>
    </div>
  );
}
