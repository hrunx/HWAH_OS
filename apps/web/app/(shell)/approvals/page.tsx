export const runtime = "nodejs";

import { getSession } from "@/lib/auth/get-session";
import { getViewCompanyId } from "@/lib/auth/view-company";
import { ApprovalsPageClient } from "@/components/approvals/approvals-page";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) return null;
  const viewCompanyId = await getViewCompanyId(session);
  return <ApprovalsPageClient companyId={viewCompanyId} />;
}


