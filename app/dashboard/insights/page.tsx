import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { SECTION_KEYS } from "@/lib/insights-prompt";
import { AveragesTable } from "./AveragesTable";
import { SectionInsightsPanel } from "./SectionInsightsPanel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const averages = await convex.query(api.signalReports.averagesBySection, {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Signal Insights</h1>
        <p className="mt-1 text-sm text-muted">
          All-time averages across {averages.counts.successful} successful
          reports, plus AI pattern analysis for each section.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-bold text-charcoal">
          Section averages
        </h2>
        <AveragesTable data={averages} />
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-bold text-charcoal">Section insights</h2>
        {SECTION_KEYS.map((section) => (
          <SectionInsightsPanel
            key={section}
            section={section}
            reportsAvailable={averages.sections[section].count}
          />
        ))}
      </section>
    </div>
  );
}
