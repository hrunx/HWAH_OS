import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarChannels } from "@pa-os/db/schema";

import { getQueues } from "@/lib/queues";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceId = req.headers.get("x-goog-resource-id");
  const resourceState = req.headers.get("x-goog-resource-state");

  // Basic validation per spec.
  if (!channelId || !resourceId || !resourceState) {
    return NextResponse.json({ ok: false, error: "Missing Google headers" }, { status: 400 });
  }

  const { db } = getDb();
  const [channel] = await db
    .select({ integrationId: calendarChannels.integrationId })
    .from(calendarChannels)
    .where(eq(calendarChannels.googleChannelId, channelId))
    .limit(1);

  if (!channel) {
    // Respond OK to avoid retries, but ignore.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Note: also compare resourceId for basic authenticity.
  const [resourceMatch] = await db
    .select({ id: calendarChannels.id })
    .from(calendarChannels)
    .where(eq(calendarChannels.googleResourceId, resourceId))
    .limit(1);
  if (!resourceMatch) return NextResponse.json({ ok: true, ignored: true });

  const queues = getQueues();
  await queues.calendarSync.add("sync", { integrationId: channel.integrationId });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}


