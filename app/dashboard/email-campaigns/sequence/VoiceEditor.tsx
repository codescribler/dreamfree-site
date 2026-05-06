"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/email-campaigns/format";
import { VOICE_SPEC_STUB_MARKER } from "@/lib/email-campaigns/roles";

export function VoiceEditor() {
  const current = useQuery(api.emailCampaigns.getCurrentVoiceSpec);
  const staleCount = useQuery(api.emailCampaigns.countStaleDraftsAll);
  const save = useMutation(api.emailCampaigns.saveVoiceSpec);

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current) {
      setBody(current.body);
      setSaved(false);
    }
  }, [current?._id, current?.version, current?.body]);

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await save({ body, editorEmail: "daniel@dreamfree.co.uk" });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (current === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (current === null) {
    return <p className="text-sm text-red-700">No voice spec found. Run seed.</p>;
  }

  const isStub = body.includes(VOICE_SPEC_STUB_MARKER);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-charcoal">
          Voice spec (v{current.version})
        </h3>
        <p className="mt-1 text-xs text-muted">
          Last updated {formatDate(current.createdAt)} by {current.createdBy}.
          Saving creates a new version. Existing pending/approved drafts get
          marked stale.
          {staleCount !== undefined && staleCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {staleCount} stale drafts in flight
            </span>
          )}
        </p>
      </div>

      {isStub && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The voice spec contains the stub marker{" "}
          <code className="rounded bg-white/70 px-1 py-0.5 text-xs font-mono">
            {VOICE_SPEC_STUB_MARKER}
          </code>
          . While this is present, the verifier flags every draft as
          voice-failed. Replace the stub before approving any sequence.
        </p>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={28}
        className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm focus:border-teal focus:outline-none"
        spellCheck={false}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || body === current.body}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save voice spec (new version)"}
        </button>
        {saved && <span className="text-xs text-green-700">Saved.</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
