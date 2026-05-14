"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

export function ActionRow({
  enrollment,
}: {
  enrollment: Doc<"emailEnrollments">;
}) {
  const approve = useMutation(api.emailCampaigns.approveEnrollment);
  const pause = useMutation(api.emailCampaigns.pauseEnrollment);
  const resume = useMutation(api.emailCampaigns.resumeEnrollment);
  const stop = useMutation(api.emailCampaigns.stopEnrollment);
  const regenerate = useMutation(api.emailCampaigns.requestRegeneration);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const id = enrollment._id as Id<"emailEnrollments">;
  const replyButton = enrollment.status === "approved";

  return (
    <div className="space-y-2">
      {replyButton && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() => pause({ enrollmentId: id, reason: "replied" }))
          }
          className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Pause — they replied
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {enrollment.status === "pending_approval" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => approve({ enrollmentId: id }))}
            className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep disabled:opacity-50"
          >
            Approve
          </button>
        )}
        {enrollment.status === "approved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => pause({ enrollmentId: id, reason: "manual" }))
            }
            className="rounded-md bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-300 hover:bg-orange-200 disabled:opacity-50"
          >
            Pause manually
          </button>
        )}
        {enrollment.status === "paused" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => resume({ enrollmentId: id }))}
            className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 ring-1 ring-green-300 hover:bg-green-200 disabled:opacity-50"
          >
            Resume
          </button>
        )}
        {!["completed", "stopped", "unsubscribed", "generating"].includes(
          enrollment.status,
        ) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => stop({ enrollmentId: id }),
                "Stop this sequence permanently? Cannot be undone.",
              )
            }
            className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-100 disabled:opacity-50"
          >
            Stop
          </button>
        )}
        {!["completed", "stopped", "unsubscribed", "generating"].includes(
          enrollment.status,
        ) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => regenerate({ enrollmentId: id, fromOrder: 0 }),
                "Regenerate the entire sequence? All current drafts will be replaced.",
              )
            }
            className="rounded-md bg-warm-grey px-3 py-1.5 text-xs font-semibold text-charcoal ring-1 ring-border hover:bg-warm-grey/70 disabled:opacity-50"
          >
            Regenerate entire sequence
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
