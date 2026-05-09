"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  REPLAYABLE_USE_CASES,
  USE_CASE_LABELS,
  type UseCase,
} from "@/lib/ai/use-cases";
import {
  SignalReportPreview,
  tryParseSignalReport,
} from "./SignalReportPreview";

interface ReplayResult {
  model: string;
  output: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costGbp?: number;
  valid: boolean;
  validationError?: string;
  rawResponse?: unknown;
}

export function ReplayClient({ adminEmail }: { adminEmail: string }) {
  const [useCase, setUseCase] = useState<UseCase>("signal_reports");
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [candidateModel, setCandidateModel] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReplayResult[] | null>(null);
  const [resultsUseCase, setResultsUseCase] = useState<UseCase>("signal_reports");
  const [error, setError] = useState<string | null>(null);

  const records = useQuery(api.aiModels.listReplayableRecords, {
    useCase,
    search: search || undefined,
    limit: 50,
  });
  const liveConfig = useQuery(api.aiModels.resolveModelsPublic, { useCase });
  const recentReplays = useQuery(api.aiModelReplay.listRecentReplays, { limit: 20 });
  const runReplay = useAction(api.aiModelReplay.runReplay);

  // Pre-fill compareModel with the live primary when use-case changes.
  useEffect(() => {
    if (liveConfig) {
      setCompareModel(liveConfig.primary);
    }
  }, [liveConfig]);

  async function run() {
    if (!recordId || !candidateModel.trim()) {
      setError("Pick a record and enter a candidate model.");
      return;
    }
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const out = await runReplay({
        useCase,
        recordId,
        candidateModel: candidateModel.trim(),
        compareModel: compareModel.trim() || undefined,
        runBy: adminEmail,
      });
      setResults(out.results as ReplayResult[]);
      setResultsUseCase(useCase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Use case</label>
          <select
            className="w-full rounded border border-border px-2 py-1.5"
            value={useCase}
            onChange={(e) => {
              setUseCase(e.target.value as UseCase);
              setRecordId(null);
              setCompareModel("");
            }}
          >
            {REPLAYABLE_USE_CASES.map((uc) => (
              <option key={uc} value={uc}>
                {USE_CASE_LABELS[uc]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Search records
          </label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5"
            placeholder="email, role, URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Source record</label>
        <div className="max-h-60 overflow-y-auto rounded border border-border bg-white">
          {records === undefined ? (
            <div className="p-3 text-sm text-muted">Loading…</div>
          ) : records.length === 0 ? (
            <div className="p-3 text-sm text-muted">No records found.</div>
          ) : (
            records.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-warm-grey/40 ${
                  recordId === r.id ? "bg-teal/10" : ""
                }`}
                onClick={() => setRecordId(r.id)}
              >
                <div className="font-medium">{r.label}</div>
                {r.subLabel && (
                  <div className="text-xs text-muted">{r.subLabel}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Candidate model</label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5 font-mono text-sm"
            placeholder="e.g. anthropic/claude-sonnet-4.6"
            value={candidateModel}
            onChange={(e) => setCandidateModel(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Compare against (live primary by default)
          </label>
          <input
            type="text"
            className="w-full rounded border border-border px-2 py-1.5 font-mono text-sm"
            value={compareModel}
            onChange={(e) => setCompareModel(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="rounded bg-teal px-4 py-2 text-white disabled:opacity-50"
          onClick={run}
          disabled={running || !recordId || !candidateModel.trim()}
        >
          {running ? "Running…" : "Run replay"}
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {results && (
        <div className="grid gap-4 md:grid-cols-2">
          {results.map((r, i) => (
            <ResultCard
              key={`${r.model}-${i}`}
              result={r}
              useCase={resultsUseCase}
            />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-bold text-charcoal">Recent replays</h2>
        <div className="rounded border border-border bg-white">
          {recentReplays === undefined ? (
            <div className="p-3 text-sm text-muted">Loading…</div>
          ) : recentReplays.length === 0 ? (
            <div className="p-3 text-sm text-muted">No replays yet.</div>
          ) : (
            recentReplays.map((rp) => (
              <button
                key={rp._id}
                type="button"
                className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-warm-grey/40"
                onClick={() => {
                  setResults(rp.results as ReplayResult[]);
                  setResultsUseCase(rp.useCase as UseCase);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    {rp.useCase} · {rp.candidateModel}
                    {rp.compareModel ? ` vs ${rp.compareModel}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(rp.runAt).toLocaleString("en-GB")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  result,
  useCase,
}: {
  result: ReplayResult;
  useCase: UseCase;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const signalReport =
    useCase === "signal_reports" ? tryParseSignalReport(result.output) : null;

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs">{result.model}</div>
        <div
          className={`rounded-full px-2 py-0.5 text-xs ${
            result.valid
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {result.valid ? "✓ valid" : "✗ invalid"}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs text-muted">
        <div>
          <div className="text-charcoal">{result.latencyMs}ms</div>
          <div>latency</div>
        </div>
        <div>
          <div className="text-charcoal">
            {result.promptTokens ?? "—"} / {result.completionTokens ?? "—"}
          </div>
          <div>prompt / completion</div>
        </div>
        <div>
          <div className="text-charcoal">
            {result.costGbp !== undefined
              ? `£${result.costGbp.toFixed(5)}`
              : "—"}
          </div>
          <div>est. cost</div>
        </div>
      </div>
      {result.validationError && (
        <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {result.validationError}
        </div>
      )}
      {signalReport ? (
        <div className="mb-2">
          <SignalReportPreview report={signalReport} />
        </div>
      ) : null}
      <details className="mb-2" open={!signalReport}>
        <summary className="cursor-pointer text-sm font-medium">
          {signalReport ? "Raw output" : "Output"}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-warm-grey/40 p-2 text-xs">
          {result.output || "(empty)"}
        </pre>
      </details>
      <button
        className="text-xs text-muted underline"
        onClick={() => setShowRaw((x) => !x)}
      >
        {showRaw ? "Hide" : "Show"} raw response
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-warm-grey/40 p-2 text-xs">
          {JSON.stringify(result.rawResponse, null, 2)}
        </pre>
      )}
    </div>
  );
}
