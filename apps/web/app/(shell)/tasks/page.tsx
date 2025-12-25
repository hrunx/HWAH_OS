import { getSession } from "@/lib/auth/get-session";
import { getViewCompanyId } from "@/lib/auth/view-company";
import { TasksPageClient } from "@/components/tasks/tasks-page";

export const runtime = "nodejs";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) return null;
  const viewCompanyId = await getViewCompanyId(session);
  return <TasksPageClient companyId={viewCompanyId} />;
}


