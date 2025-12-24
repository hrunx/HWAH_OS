import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { approvals, calendarEvents, tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pa-os/ui";
import { DailyBriefCard } from "@/components/copilot/daily-brief-card";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const { db } = getDb();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [{ count: todayMeetingsCountRaw }] = await db
    .select({ count: sql`count(*)` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.companyId, session.companyId),
        gte(calendarEvents.startsAt, startOfToday),
        lt(calendarEvents.startsAt, endOfToday),
      ),
    );
  const todayMeetingsCount = Number(todayMeetingsCountRaw ?? 0);

  const overdueTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, session.companyId),
        ne(tasks.status, "DONE"),
        lt(tasks.dueAt, now),
      ),
    );

  const pendingApprovals = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.companyId, session.companyId), eq(approvals.status, "PENDING")));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Company-scoped overview (companyId: <span className="font-mono">{session?.companyId}</span>)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Today’s Meetings</CardTitle>
            <CardDescription>From cached calendar events</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {todayMeetingsCount}
            <div className="mt-1 text-sm font-normal text-muted-foreground">Events starting today</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue Tasks</CardTitle>
            <CardDescription>Needs attention</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {overdueTasks.length}
            <div className="mt-1 text-sm font-normal text-muted-foreground">Not done and past due</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription>Awaiting your decision</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {pendingApprovals.length}
            <div className="mt-1 text-sm font-normal text-muted-foreground">Agent requests</div>
          </CardContent>
        </Card>
        <DailyBriefCard companyId={session.companyId} />
      </div>
    </div>
  );
}


