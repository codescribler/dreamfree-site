"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/email-campaigns", label: "Overview", exact: true },
  { href: "/dashboard/email-campaigns/sequence", label: "Sequence settings" },
];

export function SectionNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border">
      <div className="flex gap-6">
        {ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-mb-px border-b-2 py-2 text-sm font-medium transition ${
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
