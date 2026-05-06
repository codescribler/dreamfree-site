"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { SECTION_LABELS, SectionKey } from "@/lib/insights-prompt";

interface SectionInsightsPanelProps {
  section: SectionKey;
  reportsAvailable: number;
}

const MIN = 2;
const MAX = 100;
const DEFAULT_COUNT = 20;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SectionInsightsPanel({
  section,
  reportsAvailable,
}: SectionInsightsPanelProps) {
  const insights = useQuery(api.signalInsights.listBySection, { section });
  const [count, setCount] = useState<number>(
    Math.min(DEFAULT_COUNT, Math.max(MIN, reportsAvailable)),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = reportsAvailable >= MIN;
  const latest = insights?.[0];
  const older = insights?.slice(1) ?? [];

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, count }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Convex subscription will refresh the list automatically.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section
      id={`section-${section}`}
      className="scroll-mt-24 rounded-xl border border-border bg-white p-6"
    >
      <h2 className="mb-4 text-lg font-bold text-charcoal">
        {SECTION_LABELS[section]}
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {/* Insights history (left, 2/3) */}
        <div className="md:col-span-2">
          {insights === undefined ? (
            <p className="text-sm text-muted">Loading insights…</p>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted">
              No insights yet. Set a count and click Generate.
            </p>
          ) : (
            <div className="space-y-4">
              {latest && <InsightView insight={latest} expanded />}
              {older.map((i) => (
                <InsightView key={i._id} insight={i} expanded={false} />
              ))}
            </div>
          )}
        </div>

        {/* Generate controls (right, 1/3) */}
        <aside className="space-y-3 rounded-lg border border-border bg-warm-grey/40 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Reports to analyse
          </label>
          <input
            type="number"
            min={MIN}
            max={MAX}
            value={count}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCount(
                Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : MIN,
              );
            }}
            disabled={!canGenerate || isGenerating}
            className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted">
            {reportsAvailable} successful report
            {reportsAvailable === 1 ? "" : "s"} available
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="w-full rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
            title={
              !canGenerate
                ? `Need at least ${MIN} reports for this section`
                : undefined
            }
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {latest && (
            <p className="text-xs text-muted">
              Last run: {formatDate(latest.createdAt)} · N={latest.reportCount}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function InsightView({
  insight,
  expanded,
}: {
  insight: Doc<"signalInsights">;
  expanded: boolean;
}) {
  const summaryLine = `${formatDate(insight.createdAt)} · N=${insight.reportCount}`;

  const body = (
    <>
      <p className="mb-2 text-xs text-muted">Model: {insight.modelUsed}</p>
      <div className="prose prose-sm mb-4 max-w-none whitespace-pre-wrap text-charcoal">
        {insight.summary}
      </div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-teal-deep">
        Content ideas
      </h4>
      <ul className="space-y-3">
        {insight.contentIdeas.map((idea, i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-warm-grey/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-charcoal">{idea.hook}</p>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${idea.hook}\n\n${idea.angle}`,
                  )
                }
                className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-muted hover:text-charcoal"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-sm text-slate">{idea.angle}</p>
            {idea.format && (
              <p className="mt-1 text-xs text-muted">Format: {idea.format}</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );

  if (expanded) {
    return (
      <div className="rounded-lg border border-border bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Latest · {summaryLine}
        </p>
        {body}
      </div>
    );
  }

  return (
    <details className="group rounded-lg border border-border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-charcoal">
        {summaryLine}
      </summary>
      <div className="mt-3">{body}</div>
    </details>
  );
}
