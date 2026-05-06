"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EnrollmentHeader } from "./EnrollmentHeader";
import { ActionRow } from "./ActionRow";
import { DraftsTimeline } from "./DraftsTimeline";
import { VerificationFlags } from "./VerificationFlags";

export default function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const enrollmentId = id as Id<"emailEnrollments">;
  const data = useQuery(api.emailCampaigns.getEnrollmentWithDrafts, {
    enrollmentId,
  });

  if (data === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (data === null) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/email-campaigns"
          className="text-sm text-muted hover:text-charcoal"
        >
          ← Back to overview
        </Link>
        <p className="text-sm text-red-700">Enrollment not found.</p>
      </div>
    );
  }

  const { enrollment, drafts, lead, report } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/email-campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal"
      >
        ← Back to overview
      </Link>

      <EnrollmentHeader
        enrollment={enrollment}
        lead={lead}
        report={report}
      />

      <ActionRow enrollment={enrollment} />

      <VerificationFlags flags={enrollment.verificationFlags} />
      <DraftsTimeline drafts={drafts} />
    </div>
  );
}
