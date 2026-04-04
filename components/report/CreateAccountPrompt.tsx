"use client";

import { useState } from "react";

interface CreateAccountPromptProps {
  reportId: string;
  email: string;
}

export function CreateAccountPrompt({
  reportId,
  email,
}: CreateAccountPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/report/${reportId}/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        setDone(true);
        return;
      }

      setError(data.error || "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="my-10 rounded-2xl border border-teal/20 bg-teal-glow p-8 text-center">
        <h3 className="mb-2 text-lg font-bold text-charcoal">
          Account created
        </h3>
        <p className="text-[0.9rem] text-slate">
          You can now sign in with <strong>{email}</strong> to access your
          report from any device.
        </p>
      </div>
    );
  }

  return (
    <div className="my-10 rounded-2xl border border-border bg-warm-grey p-8 text-center">
      <h3 className="mb-2 text-lg font-bold text-charcoal">
        Save Your Access
      </h3>
      <p className="mb-6 text-[0.9rem] text-slate">
        Create a password so you can access your full report from any device.
      </p>
      <form onSubmit={handleSubmit} className="mx-auto max-w-xs">
        <input
          type="email"
          value={email}
          readOnly
          className="mb-3 w-full rounded-xl border border-border bg-white/60 px-4 py-3 text-center text-sm text-muted"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password (8+ chars)"
          minLength={8}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
          disabled={loading}
        />
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length < 8}
          className="mt-4 w-full rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? "Creating account..." : "Save My Access"}
        </button>
      </form>
      <p className="mt-3 text-xs text-muted">
        You can skip this — your report will stay accessible in this browser.
      </p>
    </div>
  );
}
