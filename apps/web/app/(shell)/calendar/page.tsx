import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarEvents, integrations } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { CalendarPageClient } from "@/components/calendar/calendar-page";

export const runtime = "nodejs";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) return null;

  const { db } = getDb();
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [googleIntegration] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.companyId, session.companyId), eq(integrations.provider, "google")))
    .limit(1);

  const events = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      status: calendarEvents.status,
      hangoutLink: calendarEvents.hangoutLink,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.companyId, session.companyId),
        gte(calendarEvents.startsAt, start),
        lt(calendarEvents.startsAt, end),
      ),
    )
    .orderBy(calendarEvents.startsAt);

  return (
    <CalendarPageClient
      companyId={session.companyId}
      googleConnected={Boolean(googleIntegration)}
      events={events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startsAt.toISOString(),
        end: e.endsAt.toISOString(),
        status: e.status,
        hangoutLink: e.hangoutLink,
      }))}
    />
  );
}


