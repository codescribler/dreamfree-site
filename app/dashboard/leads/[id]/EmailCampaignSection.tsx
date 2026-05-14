"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/email-campaigns/format";

const STATUS_BADGE: Record<string, string> = {
  generating: "bg-blue-100 text-blue-700",
  generation_failed: "bg-red-100 text-red-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  paused: "bg-orange-100 text-orange-700",
  stopped: "bg-gray-200 text-gray-700",
  completed: "bg-teal/20 text-teal-deep",
  unsubscribed: "bg-red-100 text-red-700",
};

export function EmailCampaignSection({
  leadId,
  email,
}: {
  leadId: Id<"leads">;
  email: string;
}) {
  const data = useQuery(api.emailCampaigns.getEnrollmentByLead, { leadId });
  const suppression = useQuery(api.emailCampaigns.isEmailSuppressed, { email });
  const suppress = useMutation(api.emailCampaigns.suppressEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSuppress() {
    const note = prompt(
      `Suppress ${email}? They won't receive any further sequence emails. Optional reason:`,
    );
    if (note === null) return;
    setBusy(true);
    setError(null);
    try {
      await suppress({
        email,
        note: note || undefined,
        enrollmentId: data?.enrollment._id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-charcoal">Email Campaign</h2>
      <div className="rounded-xl border border-border bg-white p-5">
        {suppression && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            <strong>Suppressed</strong> ({suppression.reason})
            {suppression.note && ` — ${suppression.note}`}
            <span className="ml-2 text-xs text-red-700">
              {formatDate(suppression.suppressedAt)}
            </span>
          </p>
        )}

        {data === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : data === null ? (
          <p className="text-sm text-muted">
            No campaign enrollment yet. One is created automatically when this
            lead generates a successful Signal Report.
          </p>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    STATUS_BADGE[data.enrollment.status] ??
                    "bg-gray-100 text-gray-600"
                  }`}
                >
                  {data.enrollment.status}
                </span>
                <span className="text-xs text-muted">
                  Sent {data.sentCount}/{data.totalDrafts} ·{" "}
                  Enrolled {formatDate(data.enrollment.enrolledAt)}
                </span>
              </div>
            </div>
            <Link
              href={`/dashboard/email-campaigns/enrollments/${data.enrollment._id}`}
              className="rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-deep"
            >
              Open enrollment →
            </Link>
          </div>
        )}

        {!suppression && (
          <button
            type="button"
            onClick={onSuppress}
            disabled={busy}
            className="mt-4 rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-100 disabled:opacity-50"
          >
            Suppress this email (manual)
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </section>
  );
}
