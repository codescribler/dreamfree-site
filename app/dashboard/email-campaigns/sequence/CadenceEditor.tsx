"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ROLES, ROLE_LABELS } from "@/lib/email-campaigns/roles";
import { formatGap, parseGap } from "@/lib/email-campaigns/format";

export function CadenceEditor({
  sequence,
}: {
  sequence: Doc<"emailSequences">;
}) {
  const setRoleGaps = useMutation(api.emailCampaigns.setRoleGaps);
  const [drafts, setDrafts] = useState<string[]>(
    sequence.roleGaps.map((g) => formatGap(g)),
  );
  const [orientationBH, setOrientationBH] = useState(
    sequence.orientationRespectsBusinessHours,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync if the upstream record changes (someone else edited).
  useEffect(() => {
    setDrafts(sequence.roleGaps.map((g) => formatGap(g)));
    setOrientationBH(sequence.orientationRespectsBusinessHours);
  }, [sequence._id, sequence.roleGaps, sequence.orientationRespectsBusinessHours]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const parsed: number[] = [];
      for (const [i, raw] of drafts.entries()) {
        const ms = parseGap(raw);
        if (ms === null) {
          throw new Error(
            `Cannot parse "${raw}" for ${ROLE_LABELS[ROLES[i]]}. Try "1 day", "2h", or "30 min".`,
          );
        }
        parsed.push(ms);
      }
      if (parsed[0] !== 0) {
        throw new Error(
          "Orientation cadence must be 0 (it sends shortly after trigger). Set the gap to 0 or 'immediate'.",
        );
      }
      await setRoleGaps({
        sequenceId: sequence._id,
        roleGaps: parsed,
        orientationRespectsBusinessHours: orientationBH,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-charcoal">Cadence</h3>
        <p className="mt-1 text-sm text-muted">
          Each gap is the wait between the previous email and this one. Use
          formats like &ldquo;1 day&rdquo;, &ldquo;2h&rdquo;, &ldquo;30 min&rdquo;, or &ldquo;0&rdquo; for immediate.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-warm-grey/50 text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Wait after previous</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role, i) => (
              <tr key={role} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-mono text-charcoal">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-charcoal">
                  {ROLE_LABELS[role]}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={drafts[i]}
                    onChange={(e) => {
                      const next = drafts.slice();
                      next[i] = e.target.value;
                      setDrafts(next);
                    }}
                    disabled={i === 0}
                    className="w-32 rounded-md border border-border bg-white px-2 py-1 text-sm focus:border-teal focus:outline-none disabled:bg-warm-grey disabled:text-muted"
                  />
                  {i === 0 && (
                    <span className="ml-2 text-xs text-muted">
                      (orientation always immediate; tweak business hours below)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={orientationBH}
          onChange={(e) => setOrientationBH(e.target.checked)}
          className="h-4 w-4 rounded border-border text-teal focus:ring-teal"
        />
        Orientation email respects business hours (otherwise it fires
        immediately on approval — even at 3am)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save cadence"}
        </button>
        {saved && (
          <span className="text-xs text-green-700">Saved.</span>
        )}
        {error && (
          <span className="text-xs text-red-700">{error}</span>
        )}
      </div>
    </div>
  );
}
