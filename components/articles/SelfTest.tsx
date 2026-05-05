"use client";

import { useState } from "react";

const QUESTIONS = [
  {
    id: "q1",
    text: "Can you write a homepage headline that names your customer's problem and your solution in 12 words or fewer?",
  },
  {
    id: "q2",
    text: "Have you done keyword research for your niche before, and could you list the top 5 buyer-intent queries off the top of your head?",
  },
  {
    id: "q3",
    text: "When was the last time you A/B tested a CTA button — and could you tell me which variant won?",
  },
];

type Answer = "yes" | "no" | null;

export function SelfTest() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({
    q1: null,
    q2: null,
    q3: null,
  });

  const score = Object.values(answers).filter((a) => a === "yes").length;
  const allAnswered = Object.values(answers).every((a) => a !== null);

  const recommendation =
    !allAnswered
      ? null
      : score === 0
        ? {
            verdict: "Hire someone.",
            detail:
              "You're not the strategist or copywriter for your own website — and that's the work that decides whether it brings in leads. Wix won't change that.",
          }
        : score === 3
          ? {
              verdict: "DIY on Wix is reasonable.",
              detail:
                "You're across the strategy and copy work yourself. The platform matters less than the operator — Wix or Squarespace will do the job.",
            }
          : {
              verdict: "Probably hire someone — at least for the foundations.",
              detail:
                "You're partway there but not all the way. Most owners in this bracket DIY a site that looks fine but doesn't convert. Pay once for the foundation; learn from it; you can take it over later.",
            };

  return (
    <div className="my-10 rounded-2xl border border-border bg-warm-grey p-6 md:p-8">
      <h3 className="mb-2 text-[1rem] font-semibold uppercase tracking-[0.06em] text-charcoal">
        60-second self-test
      </h3>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-slate">
        Answer honestly. Your score sits below.
      </p>

      <div className="space-y-5">
        {QUESTIONS.map((q, i) => (
          <div key={q.id}>
            <p className="mb-2 text-[1rem] leading-snug text-charcoal">
              <span className="font-semibold">{i + 1}.</span> {q.text}
            </p>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [q.id]: value }))
                  }
                  className={`rounded-full border px-5 py-1.5 text-[0.9rem] font-medium transition-colors ${
                    answers[q.id] === value
                      ? "border-teal bg-teal text-white"
                      : "border-border bg-white text-slate hover:border-teal hover:text-teal"
                  }`}
                  aria-pressed={answers[q.id] === value}
                >
                  {value === "yes" ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {recommendation && (
        <div
          className="mt-8 rounded-xl border border-teal/30 bg-white p-5"
          aria-live="polite"
        >
          <p className="mb-1 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
            Score: {score}/3
          </p>
          <p className="mb-2 text-[1.15rem] font-bold text-charcoal">
            {recommendation.verdict}
          </p>
          <p className="text-[0.95rem] leading-relaxed text-slate">
            {recommendation.detail}
          </p>
        </div>
      )}
    </div>
  );
}
