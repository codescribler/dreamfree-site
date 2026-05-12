"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const createKey = useAction(api.apiKeys.createKey);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await createKey({ name: name.trim() });
      setRevealed(result.key);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToClipboard() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    if (revealed && !copied) {
      if (
        !confirm(
          "You haven't copied the key yet. It cannot be retrieved again. Close anyway?",
        )
      ) {
        return;
      }
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!revealed ? (
          <form onSubmit={submit}>
            <h2 className="mb-4 text-lg font-semibold">Create API key</h2>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. outreach-script"
              className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm"
              autoFocus
              required
            />
            <p className="mb-4 text-xs text-muted">
              Used to identify the key in the dashboard. Doesn&apos;t affect the
              key value.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Save your key now</h2>
            <p className="mb-4 text-sm text-muted">
              This is the only time you&apos;ll see this value. We only store
              the SHA-256 hash.
            </p>
            <pre className="mb-4 break-all rounded-md bg-gray-100 p-3 font-mono text-xs">
              {revealed}
            </pre>
            <div className="flex justify-end gap-3">
              <button
                onClick={copyToClipboard}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={onClose}
                disabled={!copied}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
              >
                I&apos;ve saved it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
