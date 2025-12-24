import { getSession } from "@/lib/auth/get-session";
import { TasksPageClient } from "@/components/tasks/tasks-page";

export const runtime = "nodejs";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) return null;
  return <TasksPageClient companyId={session.companyId} />;
}


