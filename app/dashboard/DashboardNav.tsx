"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/insights", label: "Insights" },
  { href: "/dashboard/email-campaigns", label: "Email Campaigns" },
  { href: "/dashboard/admin/models", label: "AI Models" },
  { href: "/dashboard/admin/api-keys", label: "API Keys" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-mb-px border-b-2 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-teal text-teal"
                  : "border-transparent text-muted hover:text-charcoal"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
