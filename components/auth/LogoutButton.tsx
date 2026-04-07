"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/sign-in");
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-warm-grey hover:text-charcoal"
    >
      Sign Out
    </button>
  );
}
