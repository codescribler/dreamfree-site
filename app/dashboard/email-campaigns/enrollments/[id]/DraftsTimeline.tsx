"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";
import { formatDate, timeAgo } from "@/lib/email-campaigns/format";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
  failed: "Failed",
  skipped_terminal: "Skipped (terminal)",
  skipped_suppressed: "Skipped (suppressed)",
};

export function DraftsTimeline({
  drafts,
}: {
  drafts: Doc<"emailDrafts">[];
}) {
  if (drafts.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
        No drafts yet. The generation action may still be running.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((d) => {
        const hasStaleAfter = drafts.some(
          (other) => other.order > d.order && other.isStale,
        );
        return (
          <DraftRow key={d._id} draft={d} hasStaleAfter={hasStaleAfter} />
        );
      })}
    </div>
  );
}

function DraftRow({
  draft,
  hasStaleAfter,
}: {
  draft: Doc<"emailDrafts">;
  hasStaleAfter: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warm-grey px-2 py-0.5 font-mono text-xs text-charcoal">
            {draft.order + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            {ROLE_LABELS[draft.role as Role]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal">
            {draft.subject}
          </span>
          <DraftBadges draft={draft} />
        </div>
        <p className="mt-1 ml-12 text-xs text-muted">
          {scheduleLine(draft)}
        </p>
      </summary>
      <div className="border-t border-border bg-warm-grey/30 px-5 py-4">
        {editing ? (
          <DraftEditForm
            draft={draft}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <DraftReadView
            draft={draft}
            onEdit={() => setEditing(true)}
            hasStaleAfter={hasStaleAfter}
          />
        )}
      </div>
    </details>
  );
}

function DraftReadView({
  draft,
  onEdit,
  hasStaleAfter,
}: {
  draft: Doc<"emailDrafts">;
  onEdit: () => void;
  hasStaleAfter: boolean;
}) {
  const regenerate = useMutation(api.emailCampaigns.requestRegeneration);
  const editable = draft.status !== "sent";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRegenerate(fromOrder: number, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await regenerate({
        enrollmentId: draft.enrollmentId,
        fromOrder,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {draft.loopsOpenedHere.length > 0 && (
        <Chips
          label="Loops opened here"
          chips={draft.loopsOpenedHere}
          tone="open"
        />
      )}
      {draft.loopsClosedHere.length > 0 && (
        <Chips
          label="Loops closed here"
          chips={draft.loopsClosedHere}
          tone="close"
        />
      )}
      {draft.reportFindingsUsed.length > 0 && (
        <Chips
          label="Report findings cited"
          chips={draft.reportFindingsUsed}
          tone="finding"
        />
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Body
        </p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-white p-3 font-sans text-sm text-charcoal">
          {draft.bodyText}
        </pre>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey disabled:opacity-50"
          >
            Edit subject + body
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={() =>
              onRegenerate(
                draft.order,
                `Regenerate ${draft.role} (and any drafts after it)? This replaces their content with new LLM output.`,
              )
            }
            disabled={busy}
            className="rounded-md bg-warm-grey px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey/70 disabled:opacity-50"
          >
            Regenerate this draft
          </button>
        )}
        {draft.editedByDaniel && hasStaleAfter && (
          <button
            type="button"
            onClick={() =>
              onRegenerate(
                draft.order + 1,
                `Regenerate drafts ${draft.order + 2}–7 against your edited ${draft.role}?`,
              )
            }
            disabled={busy}
            className="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200 disabled:opacity-50"
          >
            Regenerate later drafts ({draft.order + 2}–{ROLES.length})
          </button>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function DraftEditForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Doc<"emailDrafts">;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const save = useMutation(api.emailCampaigns.saveDraftEdit);
  const [subject, setSubject] = useState(draft.subject);
  const [bodyText, setBodyText] = useState(draft.bodyText);
  const [bodyHtml, setBodyHtml] = useState(draft.bodyHtml);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode: edit text only (regen HTML from text), or edit HTML directly.
  const [showHtml, setShowHtml] = useState(false);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      // If user only edited text, regenerate HTML by wrapping paragraphs.
      const html =
        showHtml && bodyHtml !== draft.bodyHtml
          ? bodyHtml
          : textToSimpleHtml(bodyText);
      await save({
        draftId: draft._id,
        subject,
        bodyText,
        bodyHtml: html,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            Body — plain text
          </label>
          <button
            type="button"
            onClick={() => setShowHtml((v) => !v)}
            className="text-xs text-teal hover:underline"
          >
            {showHtml ? "Hide HTML" : "Edit HTML directly"}
          </button>
        </div>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={10}
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-sans text-sm focus:border-teal focus:outline-none"
        />
      </div>
      {showHtml && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-charcoal">
            Body — HTML
          </label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-xs focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">
            If you don&apos;t edit this, the HTML is auto-regenerated from your
            plain text on save.
          </p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save (later drafts will be marked stale)"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function textToSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function DraftBadges({ draft }: { draft: Doc<"emailDrafts"> }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {draft.editedByDaniel && (
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
          edited
        </span>
      )}
      {draft.isStale && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          stale
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          draft.status === "sent"
            ? "bg-blue-100 text-blue-700"
            : draft.status === "scheduled"
              ? "bg-green-100 text-green-700"
              : draft.status === "draft"
                ? "bg-gray-100 text-gray-700"
                : "bg-red-100 text-red-700"
        }`}
      >
        {STATUS_LABELS[draft.status] ?? draft.status}
      </span>
    </div>
  );
}

function scheduleLine(draft: Doc<"emailDrafts">): string {
  if (draft.status === "sent") {
    return `Sent ${formatDate(draft.sentAt)}`;
  }
  if (draft.status === "scheduled") {
    return `Will send ${timeAgo(draft.scheduledFor)} — ${formatDate(draft.scheduledFor)}`;
  }
  if (draft.status === "draft") {
    return draft.order === 0
      ? "Will be scheduled when the sequence is approved."
      : "Will be scheduled after the previous email sends.";
  }
  return draft.status;
}

function Chips({
  label,
  chips,
  tone,
}: {
  label: string;
  chips: string[];
  tone: "open" | "close" | "finding";
}) {
  const cls =
    tone === "open"
      ? "bg-blue-100 text-blue-800"
      : tone === "close"
        ? "bg-green-100 text-green-800"
        : "bg-purple-100 text-purple-800";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={`rounded-full px-2 py-0.5 text-xs font-mono ${cls}`}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
