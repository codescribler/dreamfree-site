"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/email-campaigns/format";

export function KillSwitchPanel({
  config,
}: {
  config: Doc<"campaignConfig"> | null;
}) {
  const setKillSwitch = useMutation(api.emailCampaigns.setKillSwitch);
  const [busy, setBusy] = useState(false);
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [note, setNote] = useState("");

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        Loading config…
      </div>
    );
  }

  const sendingOn = !config.globalKillSwitch;

  async function turnOn() {
    setBusy(true);
    try {
      await setKillSwitch({ on: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await setKillSwitch({ on: false, note: note || undefined });
      setShowNotePrompt(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-xl border p-5 ${
        sendingOn
          ? "border-green-300 bg-green-50"
          : "border-red-300 bg-red-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-charcoal">
            Sending Status
          </p>
          <p className="mt-1 text-2xl font-bold">
            {sendingOn ? (
              <span className="text-green-700">SENDING IS ON</span>
            ) : (
              <span className="text-red-700">SENDING IS OFF</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {sendingOn ? "Turned on" : "Turned off"} {formatDate(config.killSwitchUpdatedAt)}
            {config.killSwitchNote && !sendingOn && (
              <span className="ml-1">— note: &ldquo;{config.killSwitchNote}&rdquo;</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {sendingOn ? (
            <button
              type="button"
              onClick={() => setShowNotePrompt(true)}
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Turn sending OFF
            </button>
          ) : (
            <button
              type="button"
              onClick={turnOn}
              disabled={busy}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Turn sending ON
            </button>
          )}
        </div>
      </div>

      {showNotePrompt && (
        <div className="mt-4 rounded-lg border border-red-300 bg-white p-3">
          <label className="block text-xs font-semibold text-charcoal">
            Why are you turning sending off? (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. voice still drifting"
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm focus:border-teal focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm OFF
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNotePrompt(false);
                setNote("");
              }}
              className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!sendingOn && (
        <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-xs text-red-800">
          Drafts are still queueing as new Signal Reports come in. They will
          not send to recipients until you flip this back on.
        </p>
      )}
    </section>
  );
}
