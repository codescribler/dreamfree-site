"use client";

import { useState } from "react";

interface Element {
  score: number;
  summary: string;
  analysis: string;
  businessImpact: string;
  recommendations: string[];
}

interface SignalReport {
  gruntTest: { pass: boolean; explanation: string };
  elements: {
    character: Element;
    problem: Element;
    guide: Element;
    plan: Element;
    cta: Element;
    stakes: Element;
    transformation: Element;
  };
  quickWin: string;
  strengths: string[];
  fullSummary: string;
}

const ELEMENT_NAMES: Record<keyof SignalReport["elements"], string> = {
  character: "Character",
  problem: "Problem",
  guide: "Guide",
  plan: "Plan",
  cta: "Call to Action",
  stakes: "Stakes",
  transformation: "Transformation",
};

function scoreColor(score: number): string {
  if (score <= 3) return "bg-red-400";
  if (score <= 6) return "bg-amber-400";
  if (score <= 8) return "bg-teal";
  return "bg-emerald-500";
}

function calculateOverall(elements: SignalReport["elements"]): number {
  const total = Object.values(elements).reduce((s, el) => s + el.score, 0);
  return Math.round((total / 70) * 100);
}

export function SignalReportPreview({ report }: { report: SignalReport }) {
  const overall = calculateOverall(report.elements);
  const elementKeys = Object.keys(report.elements) as Array<
    keyof SignalReport["elements"]
  >;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between rounded bg-warm-grey/40 px-3 py-2">
        <div>
          <div className="text-2xl font-bold text-charcoal">{overall}/100</div>
          <div className="text-xs text-muted">overall</div>
        </div>
        <div
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            report.gruntTest.pass
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
          title={report.gruntTest.explanation}
        >
          Grunt test: {report.gruntTest.pass ? "pass" : "fail"}
        </div>
      </div>

      <div className="space-y-1.5">
        {elementKeys.map((key) => {
          const el = report.elements[key];
          return (
            <ElementRow
              key={key}
              name={ELEMENT_NAMES[key]}
              element={el}
            />
          );
        })}
      </div>

      <Section title="Quick win">{report.quickWin}</Section>

      <Section title="Strengths">
        <ul className="ml-4 list-disc space-y-1">
          {report.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Section>

      <Section title="Full summary">
        <p className="whitespace-pre-wrap">{report.fullSummary}</p>
      </Section>
    </div>
  );
}

function ElementRow({ name, element }: { name: string; element: Element }) {
  const [open, setOpen] = useState(false);
  const barWidth = (element.score / 10) * 100;

  return (
    <div className="rounded border border-border bg-white">
      <button
        type="button"
        className="w-full px-3 py-2 text-left"
        onClick={() => setOpen((x) => !x)}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-semibold text-charcoal">{name}</span>
          <span className="text-xs font-bold text-charcoal">
            {element.score}/10
          </span>
        </div>
        <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-warm-grey">
          <div
            className={`h-full ${scoreColor(element.score)}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p className="text-xs text-muted">{element.summary}</p>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2 text-xs">
          <div>
            <div className="mb-0.5 font-semibold text-charcoal">Analysis</div>
            <p className="whitespace-pre-wrap text-muted">{element.analysis}</p>
          </div>
          <div>
            <div className="mb-0.5 font-semibold text-charcoal">
              Business impact
            </div>
            <p className="whitespace-pre-wrap text-muted">
              {element.businessImpact}
            </p>
          </div>
          {element.recommendations.length > 0 && (
            <div>
              <div className="mb-0.5 font-semibold text-charcoal">
                Recommendations
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-muted">
                {element.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-white px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-charcoal">{title}</div>
      <div className="text-muted">{children}</div>
    </div>
  );
}

/**
 * Try to parse a raw LLM output string as a SignalReport.
 * Returns null if it doesn't match the expected shape.
 */
export function tryParseSignalReport(raw: string): SignalReport | null {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.elements &&
      parsed.gruntTest &&
      typeof parsed.gruntTest.pass === "boolean" &&
      parsed.elements.character &&
      typeof parsed.elements.character.score === "number"
    ) {
      return parsed as SignalReport;
    }
    return null;
  } catch {
    return null;
  }
}
