import { AuditPageClient } from "@/components/audit/audit-page";
import { getSession } from "@/lib/auth/get-session";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) return null;

  return <AuditPageClient companyId={session.companyId} />;
}
