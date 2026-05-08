"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { USE_CASE_LABELS, type UseCase } from "@/lib/ai/use-cases";

interface RowState {
  useCase: UseCase;
  primary: string;
  fallback: string;
}

export function ConfigClient({ adminEmail }: { adminEmail: string }) {
  const config = useQuery(api.aiModels.listConfig);
  const setConfig = useMutation(api.aiModels.setConfig);
  const clearConfig = useMutation(api.aiModels.clearConfig);
  const [editing, setEditing] = useState<RowState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (config === undefined) {
    return <div className="text-muted">Loading…</div>;
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await setConfig({
        useCase: editing.useCase,
        primary: editing.primary,
        fallback: editing.fallback,
        updatedBy: adminEmail,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset(useCase: UseCase) {
    if (!confirm(`Reset ${USE_CASE_LABELS[useCase]} to use the default config?`)) return;
    await clearConfig({ useCase });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-warm-grey/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 text-left">Use case</th>
              <th className="px-4 py-3 text-left">Primary model</th>
              <th className="px-4 py-3 text-left">Fallback model</th>
              <th className="px-4 py-3 text-left">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.map((row) => {
              const isEditing = editing?.useCase === row.useCase;
              const isOverridden = row.primary !== null;
              return (
                <tr key={row.useCase} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-charcoal">
                    {USE_CASE_LABELS[row.useCase as UseCase]}
                  </td>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          className="w-full rounded border border-border px-2 py-1"
                          value={editing!.primary}
                          onChange={(e) =>
                            setEditing({ ...editing!, primary: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="w-full rounded border border-border px-2 py-1"
                          value={editing!.fallback}
                          onChange={(e) =>
                            setEditing({ ...editing!, fallback: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-muted">—</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          className="mr-2 rounded bg-teal px-3 py-1 text-white disabled:opacity-50"
                          onClick={save}
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="rounded border border-border px-3 py-1"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs">
                        {isOverridden ? row.primary : <span className="text-muted">(uses default)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {isOverridden ? row.fallback : <span className="text-muted">(uses default)</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {row.updatedAt
                          ? new Date(row.updatedAt).toLocaleString("en-GB")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="mr-2 rounded border border-border px-3 py-1 text-xs"
                          onClick={() =>
                            setEditing({
                              useCase: row.useCase as UseCase,
                              primary: row.primary ?? "",
                              fallback: row.fallback ?? "",
                            })
                          }
                        >
                          Edit
                        </button>
                        {isOverridden && row.useCase !== "default" && (
                          <button
                            className="rounded border border-border px-3 py-1 text-xs text-muted"
                            onClick={() => reset(row.useCase as UseCase)}
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="text-sm text-muted">
        Need a model slug?{" "}
        <a
          href="https://openrouter.ai/models"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal underline"
        >
          Browse OpenRouter models →
        </a>
      </div>
    </div>
  );
}
