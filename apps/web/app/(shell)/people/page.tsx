import { getSession } from "@/lib/auth/get-session";
import { getViewCompanyId } from "@/lib/auth/view-company";
import { PeoplePageClient } from "@/components/people/people-page";

export const runtime = "nodejs";

export default async function PeoplePage() {
  const session = await getSession();
  if (!session) return null;
  const viewCompanyId = await getViewCompanyId(session);
  return <PeoplePageClient companyId={viewCompanyId} />;
}


