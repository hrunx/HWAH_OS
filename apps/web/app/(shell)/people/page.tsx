import { getSession } from "@/lib/auth/get-session";
import { PeoplePageClient } from "@/components/people/people-page";

export const runtime = "nodejs";

export default async function PeoplePage() {
  const session = await getSession();
  if (!session) return null;
  return <PeoplePageClient companyId={session.companyId} />;
}


