"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";

interface EmailCaptureProps {
  heading?: string;
  subtext?: string;
}

export function EmailCapture({
  heading = "Get articles like this in your inbox.",
  subtext = "No spam, no fluff — one useful read per fortnight.",
}: EmailCaptureProps) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitEmailCapture = useMutation(api.formSubmissions.submitEmailCapture);
  const { anonymousId } = useAnonymousId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitEmailCapture({ email, anonymousId });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] py-8">
        <div className="flex items-center justify-center rounded-2xl bg-warm-grey p-8">
          <p className="text-sm font-semibold text-teal">
            You&rsquo;re in. We&rsquo;ll send you one useful read per
            fortnight.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] py-8">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-warm-grey p-8 md:flex-row md:justify-between">
        <div className="text-center md:text-left">
          <h3 className="text-base font-bold text-charcoal">{heading}</h3>
          <p className="mt-1 text-sm text-muted">{subtext}</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex w-full gap-2 md:w-auto"
        >
          <label htmlFor="email-capture" className="sr-only">
            Email address
          </label>
          <input
            id="email-capture"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.co.uk"
            required
            className="min-w-0 flex-1 rounded-[10px] border border-border bg-white px-4 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none md:w-64 md:flex-initial"
          />
          <button
            type="submit"
            className="shrink-0 rounded-[10px] bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-300 ease-smooth hover:bg-teal-deep"
          >
            Subscribe
          </button>
        </form>
      </div>
    </div>
  );
}
