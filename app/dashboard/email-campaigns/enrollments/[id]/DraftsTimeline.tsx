"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import { ROLE_LABELS, type Role } from "@/lib/email-campaigns/roles";
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
      {drafts.map((d) => (
        <DraftRow key={d._id} draft={d} />
      ))}
    </div>
  );
}

function DraftRow({ draft }: { draft: Doc<"emailDrafts"> }) {
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
        </div>
      </div>
    </details>
  );
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
