import { verifySession } from "@/lib/session";
import { ConfigClient } from "./ConfigClient";

export default async function ModelsConfigPage() {
  const session = await verifySession();
  return <ConfigClient adminEmail={session?.email ?? "unknown"} />;
}
