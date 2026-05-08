"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/admin/models", label: "Config" },
  { href: "/dashboard/admin/models/replay", label: "Replay" },
];

export default function ModelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">AI Models</h1>
        <p className="mt-1 text-sm text-muted">
          Configure which OpenRouter models power each AI use-case, and replay
          historic prompts against candidate models before promoting them.
        </p>
      </div>
      <nav className="border-b border-border">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/dashboard/admin/models"
                ? pathname === "/dashboard/admin/models"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`-mb-px border-b-2 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-teal text-teal"
                    : "border-transparent text-muted hover:text-charcoal"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
