"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

const TABS = [
  { key: "sequence", label: "Sequence" },
  { key: "briefs", label: "Briefs" },
  { key: "voice", label: "Voice spec" },
];

export type SequenceTab = "sequence" | "briefs" | "voice";

export function SequenceTabs({ active }: { active: SequenceTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setTab(tab: string) {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <nav className="border-b border-border">
      <div className="flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 py-2 text-sm font-medium transition ${
              active === t.key
                ? "border-teal text-teal"
                : "border-transparent text-muted hover:text-charcoal"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
