"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "@/hooks/useAnonymousId";
import { Button } from "@/components/ui/Button";

/* ── Types ── */

interface FormData {
  name: string;
  email: string;
  businessDescription: string;
  goal: string;
  channelsTried: string[];
  frustration: string;
  timePerWeek: string;
  website: string;
}

type Phase = "cta" | "form" | "generating";

const GOALS = [
  { value: "More enquiries and leads", icon: "📈" },
  { value: "Build trust and authority", icon: "🏆" },
  { value: "Rank higher locally", icon: "📍" },
  { value: "Launch something new", icon: "🚀" },
];

const CHANNELS = [
  "Blog / articles",
  "Social media",
  "Paid ads",
  "Email marketing",
  "Video",
  "Nothing yet",
];

const TIME_OPTIONS = [
  { value: "Under 1 hour", desc: "Quick wins only" },
  { value: "1–2 hours", desc: "Steady and consistent" },
  { value: "3–5 hours", desc: "Serious commitment" },
  { value: "I'd rather outsource it", desc: "Hand it to the pros" },
];

const TOTAL_STEPS = 8;

/* ── Generating screen messages ── */

const GENERATING_MESSAGES = [
  "Analysing your industry...",
  "Researching what works in your sector...",
  "Identifying high-impact keywords...",
  "Matching content formats to your goals...",
  "Tailoring ideas to your time budget...",
  "Writing your personalised briefs...",
  "Finalising your 90-day plan...",
];

/* ── Component ── */

export function ContentIdeaGenerator() {
  const [phase, setPhase] = useState<Phase>("cta");
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [data, setData] = useState<FormData>({
    name: "",
    email: "",
    businessDescription: "",
    goal: "",
    channelsTried: [],
    frustration: "",
    timePerWeek: "",
    website: "",
  });
  const [error, setError] = useState("");
  const [genMsgIndex, setGenMsgIndex] = useState(0);

  const router = useRouter();
  const submitContentIdeas = useMutation(api.formSubmissions.submitContentIdeas);
  const { anonymousId } = useAnonymousId();
  const overlayRef = useRef<HTMLDivElement>(null);

  /* Lock body scroll when overlay is open */
  useEffect(() => {
    if (phase === "form" || phase === "generating") {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [phase]);

  /* Cycle generating messages */
  useEffect(() => {
    if (phase !== "generating") return;
    const interval = setInterval(() => {
      setGenMsgIndex((i) =>
        i < GENERATING_MESSAGES.length - 1 ? i + 1 : i,
      );
    }, 3000);
    return () => clearInterval(interval);
  }, [phase]);

  /* Keyboard: Enter to advance, Escape to close */
  useEffect(() => {
    if (phase !== "form") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPhase("cta");
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "TEXTAREA") return; // allow newlines in textareas
        e.preventDefault();
        if (canAdvance()) advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, data]);

  /* ── Navigation ── */

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 1: return data.name.trim().length > 0;
      case 2: return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
      case 3: return data.businessDescription.trim().length >= 20;
      case 4: return data.goal !== "";
      case 5: return data.channelsTried.length > 0;
      case 6: return data.frustration.trim().length >= 10;
      case 7: return data.timePerWeek !== "";
      case 8: return true; // website is optional
      default: return false;
    }
  }, [step, data]);

  function advance() {
    if (step < TOTAL_STEPS) {
      setDirection("forward");
      setStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  }

  function goBack() {
    if (step > 1) {
      setDirection("back");
      setStep((s) => s - 1);
    }
  }

  function toggleChannel(channel: string) {
    setData((d) => {
      if (channel === "Nothing yet") {
        return { ...d, channelsTried: d.channelsTried.includes(channel) ? [] : ["Nothing yet"] };
      }
      const without = d.channelsTried.filter((c) => c !== "Nothing yet" && c !== channel);
      if (d.channelsTried.includes(channel)) {
        return { ...d, channelsTried: without };
      }
      return { ...d, channelsTried: [...without, channel] };
    });
  }

  /* ── Submit ── */

  async function handleSubmit() {
    setError("");
    setPhase("generating");
    setGenMsgIndex(0);

    try {
      // Save lead first — returns leadId for the plan
      const result = await submitContentIdeas({
        name: data.name.trim(),
        email: data.email.trim(),
        businessDescription: data.businessDescription.trim(),
        goal: data.goal,
        channelsTried: data.channelsTried,
        frustration: data.frustration.trim(),
        timePerWeek: data.timePerWeek,
        website: data.website.trim() || undefined,
        anonymousId,
      });

      // Generate structured plan via API route
      const res = await fetch("/api/content-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name.trim(),
          email: data.email.trim(),
          businessDescription: data.businessDescription.trim(),
          goal: data.goal,
          channelsTried: data.channelsTried,
          frustration: data.frustration.trim(),
          timePerWeek: data.timePerWeek,
          website: data.website.trim() || undefined,
          anonymousId,
          leadId: result.leadId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Something went wrong. Please try again.");
      }

      const json = await res.json();

      if (json.planId) {
        router.push(`/content-plan/${json.planId}`);
      } else {
        throw new Error("Plan was generated but could not be saved. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("form");
    }
  }

  /* ── CTA (inline in article) ── */

  if (phase === "cta") {
    return (
      <div className="my-10 rounded-2xl border border-border bg-warm-grey p-8 text-center sm:p-10">
        <div className="mb-4 text-4xl">✨</div>
        <h3 className="mb-2 text-[clamp(1.2rem,2.5vw,1.5rem)] font-bold text-charcoal">
          Get Your Personalised Content Plan
        </h3>
        <p className="mx-auto mb-6 max-w-md text-[1rem] leading-relaxed text-slate">
          Answer 8 quick questions about your business and we&apos;ll generate
          a 90-day content plan with 6 specific ideas tailored to your industry,
          goals, and available time.
        </p>
        <Button variant="main" onClick={() => { setPhase("form"); setStep(1); }}>
          Build My Content Plan — Free
        </Button>
        <p className="mt-3 text-[0.8rem] text-muted">
          Takes about 60 seconds. No obligation.
        </p>
      </div>
    );
  }

  /* ── Full-screen overlay (form + generating) ── */

  const progress = phase === "generating" ? 100 : Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current) setPhase("cta"); }}
    >
      <div className="relative flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:rounded-2xl sm:shadow-2xl animate-modal-in">

        {/* Header */}
        <div className="flex-none border-b border-border px-6 py-4 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="text-[0.8rem] font-semibold uppercase tracking-[0.1em] text-teal">
              Content Idea Generator
            </span>
            <button
              type="button"
              onClick={() => setPhase("cta")}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-warm-grey hover:text-charcoal"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-teal transition-all duration-500 ease-smooth"
              style={{ width: `${progress}%` }}
            />
          </div>
          {phase === "form" && (
            <div className="mt-1.5 text-right text-[0.75rem] text-muted">
              {step} of {TOTAL_STEPS}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          {phase === "generating" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-6 h-10 w-10 animate-spinner rounded-full border-[3px] border-border border-t-teal" />
              <p className="text-[1.1rem] font-medium text-charcoal">
                Building your content plan...
              </p>
              <p
                key={genMsgIndex}
                className="mt-2 text-[0.95rem] text-muted animate-fade-in-up"
              >
                {GENERATING_MESSAGES[genMsgIndex]}
              </p>
            </div>
          ) : (
            <div
              key={step}
              className={direction === "forward" ? "animate-fade-in-up" : "animate-fade-in"}
            >
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[0.9rem] text-red-700">
                  {error}
                </div>
              )}
              {renderStep()}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "form" && (
          <div className="flex-none border-t border-border px-6 py-4 sm:px-8">
            <div className="flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 text-[0.9rem] font-medium text-muted transition-colors hover:text-charcoal"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={advance}
                disabled={!canAdvance()}
                className="inline-flex items-center gap-2 rounded-pill bg-teal px-6 py-3 text-[0.9rem] font-semibold text-white transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-lg disabled:pointer-events-none disabled:opacity-40"
              >
                {step === TOTAL_STEPS ? "Generate My Plan" : "Continue"}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {step < 3 && (
              <p className="mt-2 text-center text-[0.75rem] text-muted">
                Press <kbd className="rounded border border-border bg-warm-grey px-1.5 py-0.5 text-[0.7rem] font-medium">Enter ↵</kbd> to continue
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Step renderers ── */

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <StepLayout
            label="Let's start with you"
            heading="What's your first name?"
          >
            <input
              autoFocus
              type="text"
              value={data.name}
              onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Sarah"
              className={inputClass}
            />
          </StepLayout>
        );

      case 2:
        return (
          <StepLayout
            label={`Nice to meet you, ${data.name.split(" ")[0]}`}
            heading="What's your email address?"
            hint="We'll send you a copy of your plan."
          >
            <input
              autoFocus
              type="email"
              value={data.email}
              onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
              placeholder="you@example.co.uk"
              className={inputClass}
            />
          </StepLayout>
        );

      case 3:
        return (
          <StepLayout
            label="About your business"
            heading="What does your business do and who do you serve?"
            hint="The more detail you give, the better your plan will be."
          >
            <textarea
              autoFocus
              value={data.businessDescription}
              onChange={(e) => setData((d) => ({ ...d, businessDescription: e.target.value }))}
              rows={4}
              placeholder="e.g. We're a plumbing company in Hertfordshire serving domestic customers. We specialise in boiler installs and emergency repairs..."
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </StepLayout>
        );

      case 4:
        return (
          <StepLayout
            label="Your goal"
            heading="What's your main goal right now?"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => { setData((d) => ({ ...d, goal: g.value })); }}
                  className={cardSelectClass(data.goal === g.value)}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span className="text-[0.95rem] font-medium text-charcoal">{g.value}</span>
                </button>
              ))}
            </div>
          </StepLayout>
        );

      case 5:
        return (
          <StepLayout
            label="Your experience"
            heading="What marketing have you tried before?"
            hint="Select all that apply."
          >
            <div className="flex flex-wrap gap-2.5">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={pillClass(data.channelsTried.includes(ch))}
                >
                  {data.channelsTried.includes(ch) && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0">
                      <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {ch}
                </button>
              ))}
            </div>
          </StepLayout>
        );

      case 6:
        return (
          <StepLayout
            label="The honest bit"
            heading="What's your biggest frustration with marketing right now?"
            hint="This helps us focus your plan on what matters most."
          >
            <textarea
              autoFocus
              value={data.frustration}
              onChange={(e) => setData((d) => ({ ...d, frustration: e.target.value }))}
              rows={3}
              placeholder="e.g. We post on social media but nobody engages. We've tried Google Ads but the leads weren't relevant..."
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </StepLayout>
        );

      case 7:
        return (
          <StepLayout
            label="Time budget"
            heading="How much time can you realistically spend on content each week?"
          >
            <div className="grid gap-3">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setData((d) => ({ ...d, timePerWeek: t.value })); }}
                  className={cardSelectClass(data.timePerWeek === t.value)}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-[0.95rem] font-medium text-charcoal">{t.value}</span>
                    <span className="text-[0.8rem] text-muted">{t.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </StepLayout>
        );

      case 8:
        return (
          <StepLayout
            label="Almost done"
            heading="What's your website address?"
            hint="Optional — but it helps us make better recommendations."
          >
            <input
              autoFocus
              type="url"
              value={data.website}
              onChange={(e) => setData((d) => ({ ...d, website: e.target.value }))}
              placeholder="https://yourbusiness.co.uk"
              className={inputClass}
            />
          </StepLayout>
        );

      default:
        return null;
    }
  }
}

/* ── Shared layout for each step ── */

function StepLayout({
  label,
  heading,
  hint,
  children,
}: {
  label: string;
  heading: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-teal">
        {label}
      </p>
      <h2 className="mb-2 text-[clamp(1.15rem,2.5vw,1.4rem)] font-bold leading-snug text-charcoal">
        {heading}
      </h2>
      {hint && (
        <p className="mb-5 text-[0.9rem] text-muted">{hint}</p>
      )}
      {!hint && <div className="mb-5" />}
      {children}
    </div>
  );
}

/* ── Style constants ── */

const inputClass =
  "w-full rounded-xl border border-border bg-warm-grey px-4 py-3.5 text-[1rem] text-charcoal outline-none transition-all duration-200 placeholder:text-muted focus:border-teal focus:bg-white focus:ring-2 focus:ring-teal/20";

function cardSelectClass(selected: boolean) {
  return [
    "flex items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-all duration-200 ease-smooth",
    selected
      ? "border-teal bg-teal/5 shadow-sm"
      : "border-border bg-warm-grey hover:border-teal/40 hover:bg-white",
  ].join(" ");
}

function pillClass(selected: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2.5 text-[0.9rem] font-medium transition-all duration-200 ease-smooth",
    selected
      ? "border-teal bg-teal/5 text-teal"
      : "border-border bg-warm-grey text-slate hover:border-teal/40",
  ].join(" ");
}
