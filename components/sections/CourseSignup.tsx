"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";

export function CourseSignup() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitCourseSignup = useMutation(api.formSubmissions.submitCourseSignup);
  const { anonymousId } = useAnonymousId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitCourseSignup({ email, firstName, anonymousId });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-warm-grey p-8 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-teal text-xl font-bold text-white">
          &#10003;
        </span>
        <h3 className="text-lg font-bold text-charcoal">
          You&rsquo;re in. Day 1 is on its way.
        </h3>
        <p className="mt-2 max-w-[40ch] text-sm text-slate">
          Check your inbox for Lesson 1: Story. If it doesn&rsquo;t arrive in a
          few minutes, check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center gap-4 rounded-2xl bg-warm-grey p-8"
    >
      <p className="text-center text-sm font-medium text-slate">
        Free. Five emails over five days. Unsubscribe any time.
      </p>
      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <label htmlFor="course-first-name" className="sr-only">
          First name
        </label>
        <input
          id="course-first-name"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          required
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
        />
        <label htmlFor="course-email" className="sr-only">
          Email address
        </label>
        <input
          id="course-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.co.uk"
          required
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-muted focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-[60px] bg-teal px-6 py-3 text-sm font-semibold text-white transition-all duration-350 ease-spring hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(13,115,119,0.25)]"
        >
          Start the course
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        No spam. No sales pitch. Just five lessons that change how you think
        about your website.
      </p>
    </form>
  );
}
