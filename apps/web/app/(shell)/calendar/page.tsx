import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarEvents, companies, integrations, memberships } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { getViewCompanyId } from "@/lib/auth/view-company";
import { CalendarPageClient } from "@/components/calendar/calendar-page";

export const runtime = "nodejs";

export default async function CalendarPage() {
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
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const googleIntegration =
    viewCompanyId === "all"
      ? null
      : (
          await db
            .select({ id: integrations.id })
            .from(integrations)
            .where(and(eq(integrations.companyId, viewCompanyId), eq(integrations.provider, "google")))
            .limit(1)
        )[0] ?? null;

  const events = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      status: calendarEvents.status,
      hangoutLink: calendarEvents.hangoutLink,
      companyId: calendarEvents.companyId,
      companyName: companies.name,
    })
    .from(calendarEvents)
    .innerJoin(companies, eq(calendarEvents.companyId, companies.id))
    .where(
      and(
        inArray(calendarEvents.companyId, allowedCompanyIds),
        gte(calendarEvents.startsAt, start),
        lt(calendarEvents.startsAt, end),
      ),
    )
    .orderBy(calendarEvents.startsAt);

  return (
    <CalendarPageClient
      companyId={viewCompanyId}
      googleConnected={Boolean(googleIntegration)}
      events={events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startsAt.toISOString(),
        end: e.endsAt.toISOString(),
        status: e.status,
        hangoutLink: e.hangoutLink,
        companyId: (e as any).companyId,
        companyName: (e as any).companyName,
      }))}
    />
  );
}


