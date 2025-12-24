import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const BodySchema = z.object({
  meetingId: z.string().uuid(),
});

async function createClientSecret(sessionConfig: unknown) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 10 * 60 },
      session: sessionConfig,
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `OpenAI error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const realtimeModel = process.env.OPENAI_REALTIME_MODEL;
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL;
  if (!realtimeModel || !transcriptionModel) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_REALTIME_MODEL and OPENAI_TRANSCRIPTION_MODEL are required" },
      { status: 500 },
    );
  }

  const { db } = getDb();
  const [meeting] = await db
    .select({ id: meetings.id, companyId: meetings.companyId })
    .from(meetings)
    .where(and(eq(meetings.id, parsed.data.meetingId), eq(meetings.companyId, session.companyId)))
    .limit(1);

  if (!meeting) return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });

  // Mark meeting as LIVE when the realtime session is initiated.
  await db.update(meetings).set({ state: "LIVE" }).where(eq(meetings.id, meeting.id));

  // Primary attempt includes transcription config. If the server rejects session fields, retry minimal.
  let clientSecret: any;
  try {
    clientSecret = await createClientSecret({
      input_audio_transcription: { model: transcriptionModel },
      turn_detection: { type: "server_vad" },
    });
  } catch {
    clientSecret = await createClientSecret({
      input_audio_transcription: { model: transcriptionModel },
    });
  }

  return NextResponse.json({
    ok: true,
    realtimeModel,
    transcriptionModel,
    clientSecret,
  });
}


