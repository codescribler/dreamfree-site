import { SECTION_KEYS, SECTION_LABELS, SectionKey } from "@/lib/insights-prompt";

interface AveragesTableProps {
  data: {
    counts: { successful: number };
    sections: Record<SectionKey, { average: number; count: number }>;
  };
}

export function AveragesTable({ data }: AveragesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-warm-grey/50">
              <th className="px-4 py-3 font-semibold text-charcoal">Section</th>
              <th className="px-4 py-3 font-semibold text-charcoal">Average</th>
              <th className="px-4 py-3 font-semibold text-charcoal">Reports</th>
            </tr>
          </thead>
          <tbody>
            {SECTION_KEYS.map((key) => {
              const { average, count } = data.sections[key];
              return (
                <tr
                  key={key}
                  className="border-b border-border last:border-b-0 hover:bg-warm-grey/30"
                >
                  <td className="px-4 py-3">
                    <a
                      href={`#section-${key}`}
                      className="font-medium text-charcoal hover:text-teal hover:underline"
                    >
                      {SECTION_LABELS[key]}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-charcoal">
                    {count === 0 ? "—" : `${average.toFixed(1)} / 10`}
                  </td>
                  <td className="px-4 py-3 text-muted">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
