"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";
import { Button } from "@/components/ui/Button";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const submitContactForm = useMutation(api.formSubmissions.submitContactForm);
  const { anonymousId } = useAnonymousId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitContactForm({
        name,
        email,
        website: website || undefined,
        message,
        anonymousId,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg
          className="mb-4 h-12 w-12 text-teal"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h3 className="mb-2 text-lg font-bold text-charcoal">
          Message sent
        </h3>
        <p className="text-[0.95rem] text-slate">
          Daniel will reply personally within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="contact-name"
          className="mb-1.5 block text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-charcoal"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Your name"
          aria-required="true"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-[0.95rem] text-charcoal outline-none transition-colors duration-200 placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="mb-1.5 block text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-charcoal"
        >
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.co.uk"
          aria-required="true"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-[0.95rem] text-charcoal outline-none transition-colors duration-200 placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
      </div>
      <div>
        <label
          htmlFor="contact-url"
          className="mb-1.5 block text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-charcoal"
        >
          Website URL{" "}
          <span className="font-normal normal-case tracking-normal text-muted">
            (optional)
          </span>
        </label>
        <input
          id="contact-url"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://yourbusiness.co.uk"
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-[0.95rem] text-charcoal outline-none transition-colors duration-200 placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="mb-1.5 block text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-charcoal"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          placeholder="Tell me about your website and what you're looking for..."
          aria-required="true"
          className="w-full resize-y rounded-xl border border-border bg-white px-4 py-3 text-[0.95rem] leading-relaxed text-charcoal outline-none transition-colors duration-200 placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
      </div>
      <Button variant="main" type="submit">
        {submitting ? "Sending..." : "Send Message"}
      </Button>
      <p className="text-[0.85rem] text-muted">
        Daniel replies personally within 24 hours.
      </p>
    </form>
  );
}
