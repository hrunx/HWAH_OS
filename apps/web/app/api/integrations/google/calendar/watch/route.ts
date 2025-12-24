import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarChannels, integrations } from "@pa-os/db/schema";
import { randomUUID } from "node:crypto";

import { decryptString } from "@/lib/utils/crypto";
import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return (await res.json()) as T;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { db } = getDb();

  const [integration] = await db
    .select({
      id: integrations.id,
      accessTokenEnc: integrations.accessTokenEnc,
    })
    .from(integrations)
    .where(and(eq(integrations.companyId, session.companyId), eq(integrations.provider, "google")))
    .limit(1);

  if (!integration) {
    return NextResponse.json({ ok: false, error: "No Google integration found" }, { status: 404 });
  }

  const accessToken = decryptString(integration.accessTokenEnc);
  const channelId = randomUUID();
  const address = `${appUrl.replace(/\/+$/, "")}/api/integrations/google/calendar/webhook`;

  const watchRes = await fetchJson<{ resourceId: string; expiration?: string }>(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address,
      }),
    },
  );

  const now = new Date();
  const expirationAt = watchRes.expiration
    ? new Date(Number(watchRes.expiration))
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .insert(calendarChannels)
    .values({
      integrationId: integration.id,
      googleChannelId: channelId,
      googleResourceId: watchRes.resourceId,
      calendarId: "primary",
      expirationAt,
      syncToken: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [calendarChannels.integrationId, calendarChannels.calendarId],
      set: {
        googleChannelId: channelId,
        googleResourceId: watchRes.resourceId,
        expirationAt,
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true, channelId, expirationAt: expirationAt.toISOString() });
}


