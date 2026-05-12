import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { ApiKeysClient } from "./ApiKeysClient";

export default async function ApiKeysPage() {
  const session = await verifySession();
  if (!session) redirect("/sign-in");
  return <ApiKeysClient />;
}
