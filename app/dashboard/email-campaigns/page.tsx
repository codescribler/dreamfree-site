"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { KillSwitchPanel } from "./KillSwitchPanel";
import { StatsGrid } from "./StatsGrid";
import { PendingApprovalQueue } from "./PendingApprovalQueue";
import { ActiveList } from "./ActiveList";
import { RecentSends } from "./RecentSends";

export default function EmailCampaignsPage() {
  const config = useQuery(api.emailCampaigns.getCampaignConfig);
  const stats = useQuery(api.emailCampaigns.getCampaignStats);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Email Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Personalised soap-opera sequences triggered by Signal Reports.
        </p>
      </header>

      <KillSwitchPanel config={config ?? null} />
      <StatsGrid stats={stats ?? null} />
      <PendingApprovalQueue />
      <ActiveList />
      <RecentSends />
    </div>
  );
}
