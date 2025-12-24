import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetingAssets, meetings, transcripts } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { getQueues } from "@/lib/queues";

export const runtime = "nodejs";

const BookmarkSchema = z.object({
  t: z.number().nonnegative(),
  kind: z.enum(["Decision", "Action", "Important"]),
  note: z.string().optional(),
});

const BodySchema = z.object({
  meetingId: z.string().uuid(),
  transcript: z.object({
    fullText: z.string().min(1),
    segments: z.array(z.unknown()),
  }),
  bookmarks: z.array(BookmarkSchema).default([]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { db } = getDb();
  const [meeting] = await db
    .select({ id: meetings.id, companyId: meetings.companyId })
    .from(meetings)
    .where(eq(meetings.id, parsed.data.meetingId))
    .limit(1);

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    await tx.update(meetings).set({ state: "PROCESSING" }).where(eq(meetings.id, meeting.id));

    await tx.insert(transcripts).values({
      meetingId: meeting.id,
      provider: "openai_realtime",
      language: null,
      fullText: parsed.data.transcript.fullText,
      segmentsJson: parsed.data.transcript.segments as any,
      createdAt: new Date(),
    });

    await tx.insert(meetingAssets).values({
      meetingId: meeting.id,
      type: "BOOKMARKS",
      storageUrl: "db://meetingAssets/bookmarks",
      metadataJson: { bookmarks: parsed.data.bookmarks } as any,
      createdAt: new Date(),
    });
  });

  const queues = getQueues();
  await queues.meetingFinalize.add("finalize", {
    meetingId: meeting.id,
    companyId: meeting.companyId,
    createdByPersonId: session.personId,
  });

  return NextResponse.json({ ok: true, enqueued: true });
}


