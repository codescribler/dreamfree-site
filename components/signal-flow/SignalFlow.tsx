"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";
import { SITE } from "@/lib/constants";

type Step = 1 | 2 | 3 | "analyse" | "limit" | "error";

const STORAGE_KEY = "df_signal_flow";

function loadDraft(): { url: string; customer: string; name: string; email: string; phone: string; step: Step } {
  const empty = { url: "", customer: "", name: "", email: "", phone: "", step: 1 as Step };
  if (typeof window === "undefined") return empty;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // Only restore numeric form steps — non-form steps (analyse/error/limit) reset to 1
    if (typeof parsed.step !== "number") parsed.step = 1;
    return parsed;
  } catch { /* ignore */ }
  return empty;
}

function saveDraft(data: { url: string; customer: string; name: string; email: string; phone: string; step: Step }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

const ANALYSIS_STATUSES = [
  "Fetching your website...",
  "Reading your messaging...",
  "Checking hero identification...",
  "Evaluating problem articulation...",
  "Analysing trust signals...",
  "Testing calls to action...",
  "Running the Grunt Test...",
  "Calculating your Signal Score...",
];

export function SignalFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState("");
  const [customer, setCustomer] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [usesRemaining, setUsesRemaining] = useState(3);
  const [analyseStatus, setAnalyseStatus] = useState(ANALYSIS_STATUSES[0]);
  const [errorMessage, setErrorMessage] = useState("");

  const router = useRouter();
  const trackEvent = useMutation(api.events.track);
  const { anonymousId, sessionId } = useAnonymousId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    const draft = loadDraft();
    setIsOpen(true);
    setUrl(draft.url);
    setCustomer(draft.customer);
    setName(draft.name);
    setEmail(draft.email);
    setPhone(draft.phone);
    setStep(draft.step);
    setErrorMessage("");
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      if (draft.step === 1) urlInputRef.current?.focus();
      else if (draft.step === 2) customerInputRef.current?.focus();
      else if (draft.step === 3) nameInputRef.current?.focus();
    }, 400);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = "";
  }, []);

  const startAnalysis = useCallback(async () => {
    setStep("analyse");
    setAnalyseStatus(ANALYSIS_STATUSES[0]);

    if (anonymousId) {
      trackEvent({
        type: "signal_score_started",
        anonymousId,
        sessionId,
        path: window.location.pathname,
        properties: { url: url.trim() },
      });
    }

    // Cycle through status messages
    let i = 0;
    const statusInterval = setInterval(() => {
      i++;
      if (i < ANALYSIS_STATUSES.length) {
        setAnalyseStatus(ANALYSIS_STATUSES[i]);
      }
    }, 1500);

    try {
      const response = await fetch("/api/signal-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          customerDescription: customer.trim(),
          firstName: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          anonymousId,
        }),
      });

      clearInterval(statusInterval);
      const data = await response.json();

      if (data.error === "rate_limited") {
        setUsesRemaining(0);
        clearDraft();
        setStep("limit");
        return;
      }

      if (data.error) {
        setErrorMessage(
          data.message || "Something went wrong. Please try again.",
        );
        setUsesRemaining(data.usesRemaining ?? usesRemaining);
        setStep("error");
        return;
      }

      clearDraft();

      if (anonymousId) {
        trackEvent({
          type: "signal_score_completed",
          anonymousId,
          sessionId,
          path: window.location.pathname,
          properties: { url: url.trim(), score: data.overallScore },
        });
      }

      // Close modal and redirect to the full report page
      setIsOpen(false);
      document.body.style.overflow = "";
      router.push(`/report/${data.reportId}`);
    } catch {
      clearInterval(statusInterval);
      setErrorMessage(
        "Something went wrong connecting to our servers. Please try again.",
      );
      setStep("error");
    }
  }, [
    url,
    customer,
    name,
    email,
    phone,
    anonymousId,
    sessionId,
    trackEvent,
    usesRemaining,
  ]);

  const goNext = useCallback(
    (current: 1 | 2 | 3) => {
      if (current === 1 && !url.trim()) {
        urlInputRef.current?.focus();
        return;
      }
      if (current === 2 && !customer.trim()) {
        customerInputRef.current?.focus();
        return;
      }
      if (current === 3) {
        if (!name.trim()) {
          nameInputRef.current?.focus();
          return;
        }
        if (!email.trim() || !email.includes("@")) {
          emailInputRef.current?.focus();
          return;
        }
        startAnalysis();
        return;
      }
      setStep((current + 1) as Step);
    },
    [url, customer, name, email, startAnalysis],
  );

  const goBack = useCallback((current: 2 | 3) => {
    setStep((current - 1) as Step);
  }, []);

  // Persist form state to sessionStorage
  useEffect(() => {
    if (typeof step === "number") {
      saveDraft({ url, customer, name, email, phone, step });
    }
  }, [url, customer, name, email, phone, step]);

  // Listen for CTA trigger clicks
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e.target as HTMLElement).closest("[data-modal]");
      if (target) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Focus management on step change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (step === 1) urlInputRef.current?.focus();
      else if (step === 2) customerInputRef.current?.focus();
      else if (step === 3) nameInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [step, isOpen]);

  const progress =
    step === 1 ? 33 : step === 2 ? 66 : step === 3 ? 100 : 100;

  const displayUrl = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Signal Score flow"
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal/95 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />

      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-6 right-6 z-10 text-white/60 transition-colors duration-300 hover:text-white"
        aria-label="Close"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Progress bar */}
      {typeof step === "number" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-teal transition-all duration-500 ease-smooth"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Steps */}
      <div className="relative z-10 mx-auto w-full max-w-lg px-6 animate-modal-in">
        {/* Step 1: URL */}
        {step === 1 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              1 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              What&rsquo;s your website address?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              We&rsquo;ll analyse it against the seven elements of clear
              messaging.
            </p>
            <input
              ref={urlInputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goNext(1)}
              placeholder="https://yourbusiness.co.uk"
              autoComplete="url"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
            />
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => goNext(1)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Next
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="text-xs text-white/25">
                or press{" "}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/40">
                  Enter ↵
                </kbd>
              </span>
            </div>
          </div>
        )}

        {/* Step 2: Customer */}
        {step === 2 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              2 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Describe your perfect customer in one sentence.
            </h2>
            <p className="mb-8 text-sm text-white/50">
              Who are they, and what problem do you solve for them?
            </p>
            <input
              ref={customerInputRef}
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goNext(2)}
              placeholder="e.g. Homeowners in Hertfordshire who need a reliable plumber fast"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
            />
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => goBack(2)}
                className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M16 10H4m0 0l4-4m-4 4l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                onClick={() => goNext(2)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Next
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Name + Email */}
        {step === 3 && (
          <div className="text-center">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              3 <span className="text-white/30">of 3</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Where should we send your results?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              We&rsquo;ll email you a copy so you can refer back to it.
            </p>
            <div className="space-y-4">
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") emailInputRef.current?.focus();
                }}
                placeholder="First name"
                autoComplete="given-name"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") phoneInputRef.current?.focus();
                }}
                placeholder="Email address"
                autoComplete="email"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
              <input
                ref={phoneInputRef}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext(3)}
                placeholder="Phone number (optional)"
                autoComplete="tel"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none"
              />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={() => goBack(3)}
                className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M16 10H4m0 0l4-4m-4 4l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                onClick={() => goNext(3)}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Get My Signal Score
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10h12m0 0l-4-4m4 4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Analysing */}
        {step === "analyse" && (
          <div className="text-center">
            <div className="mb-6 inline-block h-10 w-10 animate-spinner rounded-full border-2 border-white/15 border-t-teal" />
            <h2 className="mb-3 text-2xl font-bold text-white">
              Analysing{" "}
              <span className="text-teal-bright">{displayUrl}</span>
            </h2>
            <p className="text-sm text-white/50 transition-opacity duration-200">
              {analyseStatus}
            </p>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-red-400"
              >
                <path
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white">
              Couldn&rsquo;t complete the analysis
            </h2>
            <p className="mb-8 text-sm text-white/50">{errorMessage}</p>
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Rate limit reached */}
        {step === "limit" && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal/10">
              <svg
                width="32"
                height="32"
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
            <h2 className="mb-3 text-2xl font-bold text-white">
              You&rsquo;ve used your 3 free Signal Scores
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-white/50">
              You&rsquo;ve already got 3 scores&rsquo; worth of insight.
              <br />
              For a full Signal Method audit across all 5 elements, let&rsquo;s
              have a conversation.
            </p>
            <a
              href={SITE.phoneTel}
              className="inline-flex items-center gap-2 rounded-[60px] bg-white px-8 py-3 text-sm font-semibold text-charcoal transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
            >
              Call Daniel — {SITE.phone}
            </a>
            <p className="mt-4 text-xs text-white/40">
              Or{" "}
              <a
                href={`mailto:${SITE.email}?subject=Full Signal Method audit`}
                className="text-teal-bright underline"
              >
                email Daniel
              </a>{" "}
              — no obligation, just a conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
