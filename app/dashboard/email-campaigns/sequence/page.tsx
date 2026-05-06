"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SequenceTabs, type SequenceTab } from "./SequenceTabs";
import { CadenceEditor } from "./CadenceEditor";

function SequencePageInner() {
  const params = useSearchParams();
  const tab = (params.get("tab") ?? "sequence") as SequenceTab;
  const sequence = useQuery(api.emailCampaigns.getActiveSequence);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Sequence settings</h1>
        <p className="mt-1 text-sm text-muted">
          Edit cadence, briefs, and voice spec for the Signal Report soap opera.
        </p>
      </header>

      <SequenceTabs active={tab} />

      {tab === "sequence" && (
        sequence === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : sequence === null ? (
          <p className="text-sm text-red-700">No active sequence found. Run seed.</p>
        ) : (
          <CadenceEditor sequence={sequence} />
        )
      )}

      {tab === "briefs" && (
        <p className="text-sm text-muted">Briefs editor — see Task 9.</p>
      )}

      {tab === "voice" && (
        <p className="text-sm text-muted">Voice spec editor — see Task 10.</p>
      )}
    </div>
  );
}

export default function SequencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SequencePageInner />
    </Suspense>
  );
}
