"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

const SETTINGS_PATH = "/dashboard/email-campaigns/sequence";
const AUTHORING_PATH = "/dashboard/email-campaigns/sequence/authoring";

const TABS = [
  { key: "sequence", label: "Sequence", href: `${SETTINGS_PATH}?tab=sequence` },
  { key: "briefs", label: "Briefs", href: `${SETTINGS_PATH}?tab=briefs` },
  { key: "voice", label: "Voice spec", href: `${SETTINGS_PATH}?tab=voice` },
  { key: "authoring", label: "Authoring helper", href: AUTHORING_PATH },
];

export type SequenceTab = "sequence" | "briefs" | "voice" | "authoring";

export function SequenceTabs({ active }: { active: SequenceTab }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function isActive(key: string): boolean {
    if (key === "authoring") {
      return pathname.startsWith(AUTHORING_PATH);
    }
    if (pathname !== SETTINGS_PATH) return false;
    if (key === active) return true;
    const queryTab = params.get("tab");
    if (queryTab) return queryTab === key;
    // Default tab when no ?tab= is present
    return key === "sequence";
  }

  return (
    <nav className="border-b border-border">
      <div className="flex gap-6">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px border-b-2 py-2 text-sm font-medium transition ${
              isActive(t.key)
                ? "border-teal text-teal"
                : "border-transparent text-muted hover:text-charcoal"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
