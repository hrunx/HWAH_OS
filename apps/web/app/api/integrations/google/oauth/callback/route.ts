import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarChannels, integrations } from "@pa-os/db/schema";
import { randomUUID } from "node:crypto";

import { encryptString } from "@/lib/utils/crypto";
import { getQueues } from "@/lib/queues";

export const runtime = "nodejs";

const QuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI are required");
  }
  return { clientId, clientSecret, redirectUri, appUrl };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return (await res.json()) as T;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/calendar?google=error", process.env.APP_URL ?? "http://localhost:3000"));
  }

  const jar = await cookies();
  const expectedState = jar.get("google_oauth_state")?.value;
  const codeVerifier = jar.get("google_oauth_verifier")?.value;
  const companyId = jar.get("google_oauth_company")?.value;

  jar.delete("google_oauth_state");
  jar.delete("google_oauth_verifier");
  jar.delete("google_oauth_company");

  if (!expectedState || expectedState !== parsed.data.state || !codeVerifier || !companyId) {
    return NextResponse.redirect(new URL("/calendar?google=bad_state", process.env.APP_URL ?? "http://localhost:3000"));
  }

  const { clientId, clientSecret, redirectUri, appUrl } = getGoogleConfig();

  const tokenRes = await fetchJson<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type: string;
    id_token?: string;
  }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: parsed.data.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  const accessToken = tokenRes.access_token;
  const refreshToken = tokenRes.refresh_token;
  const scopes = tokenRes.scope ? tokenRes.scope.split(" ").filter(Boolean) : [];
  const tokenExpiresAt = tokenRes.expires_in ? new Date(Date.now() + tokenRes.expires_in * 1000) : null;

  const userInfo = await fetchJson<{ email?: string }>("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const accountEmail = userInfo.email ?? "unknown";

  const { db } = getDb();

  const [existing] = await db
    .select({ id: integrations.id, refreshTokenEnc: integrations.refreshTokenEnc })
    .from(integrations)
    .where(
      and(
        eq(integrations.companyId, companyId),
        eq(integrations.provider, "google"),
        eq(integrations.accountEmail, accountEmail),
      ),
    )
    .limit(1);

  const now = new Date();
  const accessTokenEnc = encryptString(accessToken);
  const refreshTokenEnc = refreshToken ? encryptString(refreshToken) : existing?.refreshTokenEnc ?? null;

  const integrationId =
    existing?.id ??
    (
      await db
        .insert(integrations)
        .values({
          companyId,
          provider: "google",
          accountEmail,
          accessTokenEnc,
          refreshTokenEnc,
          scopes,
          tokenExpiresAt: tokenExpiresAt ?? undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: integrations.id })
    )[0]!.id;

  if (existing?.id) {
    await db
      .update(integrations)
      .set({
        accessTokenEnc,
        refreshTokenEnc,
        scopes,
        tokenExpiresAt: tokenExpiresAt ?? null,
        updatedAt: now,
      })
      .where(eq(integrations.id, existing.id));
  }

  // Try to create a watch channel for primary calendar.
  try {
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

    const expirationAt = watchRes.expiration ? new Date(Number(watchRes.expiration)) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db
      .insert(calendarChannels)
      .values({
        integrationId,
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
  } catch {
    // Likely APP_URL not publicly reachable / not HTTPS. Manual sync still works.
  }

  // Enqueue initial sync for debugging.
  try {
    const queues = getQueues();
    await queues.calendarSync.add("sync", { integrationId });
  } catch {
    // ignore
  }

  return NextResponse.redirect(new URL("/calendar?google=connected", appUrl));
}


