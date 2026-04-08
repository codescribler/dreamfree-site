"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";

type Step = 1 | 2 | 3 | 4 | 5 | "submitting" | "done";

const TOTAL_STEPS = 5;

const INDUSTRIES = [
  "Construction & Trades",
  "Healthcare & Wellness",
  "Sports & Fitness",
  "Hospitality & Food",
  "Professional Services",
  "Retail & E-commerce",
  "Education & Training",
  "Property & Real Estate",
  "Creative & Design",
  "Other",
];

export default function DemoRequestPage() {
  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [idealCustomer, setIdealCustomer] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [likedSites, setLikedSites] = useState("");
  const [brandNotes, setBrandNotes] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [error, setError] = useState("");

  const submitDemoRequest = useMutation(api.demoRequests.submit);
  const { anonymousId } = useAnonymousId();

  const firstNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const businessNameRef = useRef<HTMLInputElement>(null);
  const industryRef = useRef<HTMLSelectElement>(null);
  const idealCustomerRef = useRef<HTMLTextAreaElement>(null);
  const mainGoalRef = useRef<HTMLTextAreaElement>(null);
  const likedSitesRef = useRef<HTMLTextAreaElement>(null);

  // Focus management
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 1) firstNameRef.current?.focus();
      else if (step === 2) businessNameRef.current?.focus();
      else if (step === 3) idealCustomerRef.current?.focus();
      else if (step === 4) likedSitesRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [step]);

  const goNext = useCallback(() => {
    setError("");
    if (step === 1) {
      if (!firstName.trim()) { firstNameRef.current?.focus(); setError("Please enter your first name."); return; }
      if (!email.trim() || !email.includes("@")) { emailRef.current?.focus(); setError("Please enter a valid email."); return; }
      setStep(2);
    } else if (step === 2) {
      if (!businessName.trim()) { businessNameRef.current?.focus(); setError("Please enter your business name."); return; }
      if (!industry) { industryRef.current?.focus(); setError("Please select your industry."); return; }
      setStep(3);
    } else if (step === 3) {
      if (!idealCustomer.trim()) { idealCustomerRef.current?.focus(); setError("Please describe your ideal customer."); return; }
      if (!mainGoal.trim()) { mainGoalRef.current?.focus(); setError("Please describe your main goal."); return; }
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    }
  }, [step, firstName, email, businessName, industry, idealCustomer, mainGoal]);

  const goBack = useCallback(() => {
    setError("");
    if (typeof step === "number" && step > 1) {
      setStep((step - 1) as Step);
    }
  }, [step]);

  const handleSubmit = useCallback(async () => {
    setStep("submitting");
    setError("");
    try {
      await submitDemoRequest({
        firstName: firstName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        businessName: businessName.trim(),
        website: website.trim() || undefined,
        industry,
        idealCustomer: idealCustomer.trim(),
        mainGoal: mainGoal.trim(),
        likedSites: likedSites.trim() || undefined,
        brandNotes: brandNotes.trim() || undefined,
        additionalInfo: additionalInfo.trim() || undefined,
        anonymousId: anonymousId || undefined,
      });
      // Pre-fill the Signal Score flow so it opens with their data
      try {
        sessionStorage.setItem(
          "df_signal_flow",
          JSON.stringify({
            url: website.trim(),
            customer: idealCustomer.trim(),
            name: firstName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            step: website.trim() ? 2 : 1,
          }),
        );
      } catch { /* ignore */ }

      setStep("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep(5);
    }
  }, [
    submitDemoRequest, firstName, email, phone, businessName, website,
    industry, idealCustomer, mainGoal, likedSites, brandNotes, additionalInfo,
    anonymousId,
  ]);

  const progress = typeof step === "number" ? (step / TOTAL_STEPS) * 100 : 100;

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none";
  const textareaClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white placeholder:text-white/25 focus:border-teal focus:outline-none resize-none";
  const selectClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white focus:border-teal focus:outline-none appearance-none";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-charcoal/98">
      {/* Progress bar */}
      {typeof step === "number" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-teal transition-all duration-500 ease-smooth"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back to landing page */}
      <a
        href="/free-demo"
        className="absolute top-6 left-6 z-10 text-sm text-white/40 transition-colors duration-300 hover:text-white"
      >
        &larr; Back
      </a>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-lg px-6 py-8 max-h-dvh overflow-y-auto scrollbar-none">
        {/* ── Step 1: Name + Email ── */}
        {step === 1 && (
          <div className="text-center animate-modal-in">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              1 <span className="text-white/30">of {TOTAL_STEPS}</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Let&rsquo;s start with you.
            </h2>
            <p className="mb-8 text-sm text-white/50">
              We&rsquo;ll use this to send you your demo when it&rsquo;s ready.
            </p>
            <div className="space-y-4">
              <input
                ref={firstNameRef}
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && emailRef.current?.focus()}
                placeholder="First name"
                autoComplete="given-name"
                className={inputClass}
              />
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                placeholder="Email address"
                autoComplete="email"
                className={inputClass}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                placeholder="Phone number (optional)"
                autoComplete="tel"
                className={inputClass}
              />
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            <StepNav onNext={goNext} />
          </div>
        )}

        {/* ── Step 2: Business Details ── */}
        {step === 2 && (
          <div className="text-center animate-modal-in">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              2 <span className="text-white/30">of {TOTAL_STEPS}</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Tell us about your business.
            </h2>
            <p className="mb-8 text-sm text-white/50">
              This helps us research your market before we start.
            </p>
            <div className="space-y-4">
              <input
                ref={businessNameRef}
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && industryRef.current?.focus()}
                placeholder="Business name"
                className={inputClass}
              />
              <div className="relative">
                <select
                  ref={industryRef}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className={selectClass}
                  style={{ color: industry ? "white" : "rgba(255,255,255,0.25)" }}
                >
                  <option value="" disabled>
                    Select your industry
                  </option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind} className="bg-charcoal text-white">
                      {ind}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white/40"
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goNext()}
                placeholder="Current website URL (optional)"
                autoComplete="url"
                className={inputClass}
              />
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            <StepNav onNext={goNext} onBack={goBack} />
          </div>
        )}

        {/* ── Step 3: Customer & Goals ── */}
        {step === 3 && (
          <div className="text-center animate-modal-in">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              3 <span className="text-white/30">of {TOTAL_STEPS}</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Who are you trying to reach?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              The more specific, the better your demo will be.
            </p>
            <div className="space-y-4">
              <textarea
                ref={idealCustomerRef}
                value={idealCustomer}
                onChange={(e) => setIdealCustomer(e.target.value)}
                placeholder="Describe your ideal customer in one sentence — e.g. 'Homeowners in Hertfordshire who need a reliable plumber fast'"
                rows={3}
                className={textareaClass}
              />
              <textarea
                ref={mainGoalRef}
                value={mainGoal}
                onChange={(e) => setMainGoal(e.target.value)}
                placeholder="What's the main goal of your website? — e.g. 'Get more phone enquiries from local customers'"
                rows={3}
                className={textareaClass}
              />
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            <StepNav onNext={goNext} onBack={goBack} />
          </div>
        )}

        {/* ── Step 4: Design Preferences ── */}
        {step === 4 && (
          <div className="text-center animate-modal-in">
            <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
              4 <span className="text-white/30">of {TOTAL_STEPS}</span>
            </span>
            <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
              Any design preferences?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              All optional &mdash; skip ahead if you&rsquo;re not sure.
            </p>
            <div className="space-y-4">
              <textarea
                ref={likedSitesRef}
                value={likedSites}
                onChange={(e) => setLikedSites(e.target.value)}
                placeholder="Link 1–2 websites you like the look of (optional)"
                rows={2}
                className={textareaClass}
              />
              <textarea
                value={brandNotes}
                onChange={(e) => setBrandNotes(e.target.value)}
                placeholder="Any brand colours, fonts, or style notes? (optional)"
                rows={2}
                className={textareaClass}
              />
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Anything else we should know? (optional)"
                rows={2}
                className={textareaClass}
              />
            </div>
            <StepNav onNext={goNext} onBack={goBack} nextLabel="Review" />
          </div>
        )}

        {/* ── Step 5: Review + Submit ── */}
        {step === 5 && (
          <div className="animate-modal-in">
            <div className="text-center">
              <span className="mb-4 block text-xs font-semibold tracking-[0.12em] text-teal-bright">
                5 <span className="text-white/30">of {TOTAL_STEPS}</span>
              </span>
              <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">
                Check your details.
              </h2>
              <p className="mb-8 text-sm text-white/50">
                Everything look right? Hit submit and we&rsquo;ll get started.
              </p>
            </div>

            <div className="space-y-4">
              <ReviewSection
                label="About You"
                onEdit={() => setStep(1)}
                items={[
                  ["Name", firstName],
                  ["Email", email],
                  ...(phone ? [["Phone", phone] as [string, string]] : []),
                ]}
              />
              <ReviewSection
                label="Your Business"
                onEdit={() => setStep(2)}
                items={[
                  ["Business", businessName],
                  ["Industry", industry],
                  ...(website ? [["Website", website] as [string, string]] : []),
                ]}
              />
              <ReviewSection
                label="Your Customer & Goals"
                onEdit={() => setStep(3)}
                items={[
                  ["Ideal customer", idealCustomer],
                  ["Main goal", mainGoal],
                ]}
              />
              {(likedSites || brandNotes || additionalInfo) && (
                <ReviewSection
                  label="Design Preferences"
                  onEdit={() => setStep(4)}
                  items={[
                    ...(likedSites ? [["Liked sites", likedSites] as [string, string]] : []),
                    ...(brandNotes ? [["Brand notes", brandNotes] as [string, string]] : []),
                    ...(additionalInfo ? [["Additional info", additionalInfo] as [string, string]] : []),
                  ]}
                />
              )}
            </div>

            {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

            <div className="mt-8 flex items-center justify-center gap-4">
              <BackButton onClick={goBack} />
              <button
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Submit Request
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Submitting ── */}
        {step === "submitting" && (
          <div className="text-center animate-modal-in">
            <div className="mb-6 inline-block h-10 w-10 animate-spinner rounded-full border-2 border-white/15 border-t-teal" />
            <h2 className="mb-3 text-2xl font-bold text-white">
              Sending your request&hellip;
            </h2>
            <p className="text-sm text-white/50">
              This will only take a moment.
            </p>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="text-center animate-modal-in">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal/10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-teal">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-white">
              You&rsquo;re in the queue, {firstName}!
            </h2>
            <p className="mb-2 text-sm leading-relaxed text-white/60">
              We&rsquo;ve got everything we need. We&rsquo;ll research your
              business, write the messaging, and build your demo homepage.
            </p>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              Expect a link in your inbox within a few working days. We&rsquo;ve
              sent a confirmation to{" "}
              <strong className="text-white/80">{email}</strong>.
            </p>

            <div className="space-y-4">
              <button
                data-modal="signal-flow"
                className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
              >
                Get Your Free Signal Score While You Wait
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <p className="text-sm text-white/40">
                Or read:{" "}
                <a
                  href="/learning-centre/signal-score-35"
                  className="text-teal-bright underline transition-colors hover:text-teal"
                >
                  What a Signal Score of 35 actually means &mdash; and how to fix it
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components ── */

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-300 hover:text-white"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M16 10H4m0 0l4-4m-4 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

function StepNav({
  onNext,
  onBack,
  nextLabel = "Next",
}: {
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div className="flex items-center gap-4">
        {onBack && <BackButton onClick={onBack} />}
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-[60px] bg-teal px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(13,115,119,0.3)]"
        >
          {nextLabel}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <span className="text-xs text-white/25">
        or press{" "}
        <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/40">
          Enter &crarr;
        </kbd>
      </span>
    </div>
  );
}

function ReviewSection({
  label,
  onEdit,
  items,
}: {
  label: string;
  onEdit: () => void;
  items: [string, string][];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-teal-bright">
          {label}
        </span>
        <button
          onClick={onEdit}
          className="text-xs font-medium text-white/40 transition-colors hover:text-white"
        >
          Edit
        </button>
      </div>
      <div className="space-y-2">
        {items.map(([key, value]) => (
          <div key={key} className="flex gap-3 text-sm">
            <span className="shrink-0 text-white/40">{key}:</span>
            <span className="text-white/80">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
