import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { approvals, calendarEvents, memberships, tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { getViewCompanyId } from "@/lib/auth/view-company";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pa-os/ui";
import { DailyBriefCard } from "@/components/copilot/daily-brief-card";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const { db } = getDb();
  const viewCompanyId = await getViewCompanyId(session);
  const allowedCompanyIds =
    viewCompanyId === "all"
      ? (
          await db
            .select({ companyId: memberships.companyId })
            .from(memberships)
            .where(eq(memberships.personId, session.personId))
        ).map((r) => r.companyId)
      : [viewCompanyId];

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
        inArray(calendarEvents.companyId, allowedCompanyIds),
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
        inArray(tasks.companyId, allowedCompanyIds),
        ne(tasks.status, "DONE"),
        lt(tasks.dueAt, now),
      ),
    );

  const pendingApprovals = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(inArray(approvals.companyId, allowedCompanyIds), eq(approvals.status, "PENDING")));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {viewCompanyId === "all" ? (
            <>All companies overview</>
          ) : (
            <>
              Company-scoped overview (companyId: <span className="font-mono">{viewCompanyId}</span>)
            </>
          )}
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
        <DailyBriefCard companyId={viewCompanyId === "all" ? session.companyId : viewCompanyId} />
      </div>
    </div>
  );
}


