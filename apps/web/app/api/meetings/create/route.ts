import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarEvents, meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyId: z.string().uuid(),
  calendarEventId: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  const { db } = getDb();
  const now = new Date();

  let title = "Meeting";
  let startsAt = now;
  let endsAt = new Date(now.getTime() + 30 * 60 * 1000);
  let calendarEventId: string | null = null;

  if (parsed.data.calendarEventId) {
    const [ev] = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, parsed.data.calendarEventId), eq(calendarEvents.companyId, parsed.data.companyId)))
      .limit(1);

    if (!ev) {
      return NextResponse.json({ ok: false, error: "Calendar event not found" }, { status: 404 });
    }

    title = ev.title;
    startsAt = ev.startsAt;
    endsAt = ev.endsAt;
    calendarEventId = ev.id;
  }

  const [meeting] = await db
    .insert(meetings)
    .values({
      companyId: parsed.data.companyId,
      calendarEventId,
      title,
      startsAt,
      endsAt,
      state: "SCHEDULED",
      createdAt: now,
    })
    .returning({ id: meetings.id });

  return NextResponse.json({ ok: true, meetingId: meeting.id });
}


