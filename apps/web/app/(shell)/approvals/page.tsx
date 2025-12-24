export const runtime = "nodejs";

import { getSession } from "@/lib/auth/get-session";
import { ApprovalsPageClient } from "@/components/approvals/approvals-page";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) return null;
  return <ApprovalsPageClient companyId={session.companyId} />;
}


