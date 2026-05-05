"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "password" | "magic";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialError =
    searchParams.get("error") === "expired_link"
      ? "That sign-in link has expired or already been used. Request a new one."
      : searchParams.get("error") === "invalid_link"
        ? "That sign-in link is invalid."
        : "";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      setMagicSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-extrabold tracking-tight text-charcoal">
          Sign In
        </h1>

        {magicSent ? (
          <div className="rounded-lg border border-border bg-white p-6 text-center">
            <p className="text-sm text-charcoal">
              If an account exists for <strong>{email}</strong>, a sign-in link
              is on its way. Check your inbox — the link expires in 15 minutes.
            </p>
            <button
              onClick={() => {
                setMagicSent(false);
                setMode("password");
              }}
              className="mt-4 text-sm font-medium text-teal hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-slate"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-charcoal outline-none focus:border-teal focus:ring-1 focus:ring-teal"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-charcoal outline-none focus:border-teal focus:ring-1 focus:ring-teal"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-deep disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <p className="text-center text-sm text-slate">
              <button
                type="button"
                onClick={() => {
                  setMode("magic");
                  setError("");
                }}
                className="font-medium text-teal hover:underline"
              >
                Email me a sign-in link instead
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleMagicSubmit} className="space-y-4">
            <p className="text-sm text-slate">
              Enter your email and we&rsquo;ll send you a one-time sign-in link.
            </p>
            <div>
              <label
                htmlFor="magic-email"
                className="mb-1 block text-sm font-medium text-slate"
              >
                Email
              </label>
              <input
                id="magic-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-charcoal outline-none focus:border-teal focus:ring-1 focus:ring-teal"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-deep disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send sign-in link"}
            </button>
            <p className="text-center text-sm text-slate">
              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setError("");
                }}
                className="font-medium text-teal hover:underline"
              >
                Use password instead
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
