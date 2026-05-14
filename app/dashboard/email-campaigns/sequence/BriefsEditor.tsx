"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";

const FIELDS: Array<{
  key: keyof Pick<
    Doc<"emailRoleBriefs">,
    | "purpose"
    | "requiredBeats"
    | "loopsToOpen"
    | "loopsToClose"
    | "tone"
    | "lengthGuide"
    | "workedExample"
  >;
  label: string;
  rows: number;
}> = [
  { key: "purpose", label: "Purpose", rows: 3 },
  { key: "requiredBeats", label: "Required beats", rows: 4 },
  { key: "loopsToOpen", label: "Loops to open", rows: 3 },
  { key: "loopsToClose", label: "Loops to close", rows: 2 },
  { key: "tone", label: "Tone", rows: 2 },
  { key: "lengthGuide", label: "Length guide", rows: 1 },
  { key: "workedExample", label: "Worked example (anchor for the LLM)", rows: 12 },
];

export function BriefsEditor({
  sequenceId,
}: {
  sequenceId: Id<"emailSequences">;
}) {
  const [activeRole, setActiveRole] = useState<Role>("orientation");
  const briefs = useQuery(api.emailCampaigns.getCurrentBriefs, { sequenceId });
  const staleCounts = useQuery(api.emailCampaigns.countStaleDraftsByRole, {
    sequenceId,
  });

  const activeBrief = briefs?.find((b) => b.role === activeRole) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <ul className="space-y-1">
          {ROLES.map((role, i) => {
            const stale = staleCounts?.[role] ?? 0;
            return (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                    role === activeRole
                      ? "bg-teal/10 font-semibold text-teal"
                      : "text-charcoal hover:bg-warm-grey"
                  }`}
                >
                  <span>
                    <span className="mr-2 text-xs text-muted">{i + 1}</span>
                    {ROLE_LABELS[role]}
                  </span>
                  {stale > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {stale}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div>
        {briefs === undefined ? (
          <p className="text-sm text-muted">Loading briefs…</p>
        ) : activeBrief === null ? (
          <p className="text-sm text-red-700">No brief found for {activeRole}.</p>
        ) : (
          <BriefForm key={activeBrief._id} brief={activeBrief} />
        )}
      </div>
    </div>
  );
}

function BriefForm({ brief }: { brief: Doc<"emailRoleBriefs"> }) {
  const saveBrief = useMutation(api.emailCampaigns.saveBrief);
  const [values, setValues] = useState({
    purpose: brief.purpose,
    requiredBeats: brief.requiredBeats,
    loopsToOpen: brief.loopsToOpen,
    loopsToClose: brief.loopsToClose,
    tone: brief.tone,
    lengthGuide: brief.lengthGuide,
    workedExample: brief.workedExample,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync when a different brief is loaded into the same form.
  // Intentionally partial deps: the form is keyed by _id at the parent so
  // it remounts on selection change; this effect handles the "saved → new
  // version" case where the same role's brief gets a new identity.
  useEffect(() => {
    setValues({
      purpose: brief.purpose,
      requiredBeats: brief.requiredBeats,
      loopsToOpen: brief.loopsToOpen,
      loopsToClose: brief.loopsToClose,
      tone: brief.tone,
      lengthGuide: brief.lengthGuide,
      workedExample: brief.workedExample,
    });
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief._id, brief.version]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveBrief({
        sequenceId: brief.sequenceId,
        role: brief.role,
        ...values,
        editorEmail: "daniel@dreamfree.co.uk",
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-charcoal">
            {brief.role} (v{brief.version})
          </h3>
          <p className="mt-1 text-xs text-muted">
            Saving creates a new version. Existing pending/approved drafts using
            older versions get marked stale.
          </p>
        </div>
      </div>

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            {field.label}
          </label>
          <textarea
            value={values[field.key]}
            onChange={(e) =>
              setValues({ ...values, [field.key]: e.target.value })
            }
            rows={field.rows}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
          />
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save brief (new version)"}
        </button>
        {saved && <span className="text-xs text-green-700">Saved.</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
