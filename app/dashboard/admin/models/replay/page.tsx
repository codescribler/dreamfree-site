import { verifySession } from "@/lib/session";
import { ReplayClient } from "./ReplayClient";

export default async function ModelsReplayPage() {
  const session = await verifySession();
  return <ReplayClient adminEmail={session?.email ?? "unknown"} />;
}
