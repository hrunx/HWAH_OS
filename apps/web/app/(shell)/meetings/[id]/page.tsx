export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { MeetingRoom } from "@/components/meetings/meeting-room";

export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return null;

  const { db } = getDb();
  const [meeting] = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      state: meetings.state,
    })
    .from(meetings)
    .where(and(eq(meetings.id, params.id), eq(meetings.companyId, session.companyId)))
    .limit(1);

  if (!meeting) redirect("/meetings");

  return (
    <MeetingRoom
      companyId={session.companyId}
      meeting={{
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        endsAt: meeting.endsAt.toISOString(),
        state: meeting.state,
      }}
    />
  );
}


