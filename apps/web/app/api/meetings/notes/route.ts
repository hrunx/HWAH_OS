import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetingAssets, meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  meetingId: z.string().uuid(),
});

const BodySchema = z.object({
  meetingId: z.string().uuid(),
  contentJson: z.unknown(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ meetingId: url.searchParams.get("meetingId") });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });

  const { db } = getDb();
  const [m] = await db
    .select({ id: meetings.id, companyId: meetings.companyId })
    .from(meetings)
    .where(eq(meetings.id, parsed.data.meetingId))
    .limit(1);
  if (!m) return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  if (m.companyId !== session.companyId) return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });

  const [asset] = await db
    .select({ metadataJson: meetingAssets.metadataJson })
    .from(meetingAssets)
    .where(and(eq(meetingAssets.meetingId, m.id), eq(meetingAssets.type, "NOTES")))
    .orderBy(desc(meetingAssets.createdAt))
    .limit(1);

  return NextResponse.json({ ok: true, contentJson: (asset?.metadataJson as any)?.contentJson ?? null });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const { db } = getDb();
  const [m] = await db
    .select({ id: meetings.id, companyId: meetings.companyId })
    .from(meetings)
    .where(eq(meetings.id, parsed.data.meetingId))
    .limit(1);
  if (!m) return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  if (m.companyId !== session.companyId) return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });

  await db.insert(meetingAssets).values({
    meetingId: m.id,
    type: "NOTES",
    storageUrl: "db://meetingAssets/notes",
    metadataJson: { contentJson: parsed.data.contentJson } as any,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}


