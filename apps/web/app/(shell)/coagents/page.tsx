import { getSession } from "@/lib/auth/get-session";
import { CoAgentsPageClient } from "@/components/coagents/coagents-page";

export const runtime = "nodejs";

export default async function CoAgentsPage() {
  const session = await getSession();
  if (!session) return null;
  return <CoAgentsPageClient companyId={session.companyId} />;
}


