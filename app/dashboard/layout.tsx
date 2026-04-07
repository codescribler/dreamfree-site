import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-warm-grey">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-charcoal">
              Dreamfree
            </Link>
            <span className="rounded-md bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">
              Dashboard
            </span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
