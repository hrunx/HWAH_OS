import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarChannels, calendarEvents, integrations } from "@pa-os/db/schema";

import { decryptString } from "../lib/crypto.js";
import { googleCalendarListEvents, refreshAccessTokenIfNeeded } from "../lib/google.js";

type CalendarSyncJob = {
  integrationId: string;
};

function toDateOrNull(value: unknown) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEventTime(value: { dateTime?: string; date?: string } | undefined): Date {
  if (value?.dateTime) return new Date(value.dateTime);
  if (value?.date) return new Date(value.date);
  return new Date();
}

export async function calendarSyncProcessor(job: Job<CalendarSyncJob>) {
  const integrationId = job.data?.integrationId;
  if (!integrationId) throw new Error("calendarSync job missing integrationId");

  job.log(`calendarSync start integrationId=${integrationId}`);

  const { db } = getDb();
  const [integration] = await db
    .select({
      id: integrations.id,
      companyId: integrations.companyId,
      accessTokenEnc: integrations.accessTokenEnc,
      refreshTokenEnc: integrations.refreshTokenEnc,
      tokenExpiresAt: integrations.tokenExpiresAt,
    })
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.provider, "google")))
    .limit(1);

  if (!integration) {
    job.log("integration not found; skipping");
    return;
  }

  const tokenExpiresAt = toDateOrNull(integration.tokenExpiresAt);
  const refreshed = await refreshAccessTokenIfNeeded({
    accessTokenEnc: integration.accessTokenEnc,
    refreshTokenEnc: integration.refreshTokenEnc,
    tokenExpiresAt,
  });

  if (refreshed.didRefresh) {
    await db
      .update(integrations)
      .set({
        accessTokenEnc: refreshed.accessTokenEnc,
        tokenExpiresAt: refreshed.tokenExpiresAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integration.id));
  }

  const accessToken = decryptString(refreshed.accessTokenEnc);

  const channels = await db
    .select({
      id: calendarChannels.id,
      calendarId: calendarChannels.calendarId,
      syncToken: calendarChannels.syncToken,
    })
    .from(calendarChannels)
    .where(eq(calendarChannels.integrationId, integrationId));

  // If no channels were created (e.g., webhook watch failed), sync primary without a channel.
  const channelsToSync =
    channels.length > 0
      ? channels
      : [
          {
            id: null as unknown as string,
            calendarId: "primary",
            syncToken: null as string | null,
          },
        ];

  for (const ch of channelsToSync) {
    const calendarId = ch.calendarId;
    let syncToken = ch.syncToken ?? null;

    // Full sync window (local cache)
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    let pageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;

    async function listOnce() {
      return await googleCalendarListEvents({
        accessToken,
        calendarId,
        syncToken,
        timeMin: syncToken ? undefined : timeMin,
        timeMax: syncToken ? undefined : timeMax,
        pageToken,
      });
    }

    try {
      while (true) {
        const res = await listOnce();
        const items = res.items ?? [];
        pageToken = res.nextPageToken;
        nextSyncToken = res.nextSyncToken;

        for (const e of items) {
          if (!e.id || !e.etag) continue;
          const startsAt = parseEventTime(e.start);
          const endsAt = parseEventTime(e.end);

          await db
            .insert(calendarEvents)
            .values({
              companyId: integration.companyId,
              integrationId,
              calendarId,
              googleEventId: e.id,
              etag: e.etag,
              title: e.summary ?? "(No title)",
              startsAt,
              endsAt,
              status: e.status ?? "unknown",
              attendeesJson: e.attendees ?? [],
              hangoutLink: e.hangoutLink ?? null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                calendarEvents.integrationId,
                calendarEvents.calendarId,
                calendarEvents.googleEventId,
              ],
              set: {
                etag: e.etag,
                title: e.summary ?? "(No title)",
                startsAt,
                endsAt,
                status: e.status ?? "unknown",
                attendeesJson: e.attendees ?? [],
                hangoutLink: e.hangoutLink ?? null,
                updatedAt: new Date(),
              },
            });
        }

        if (!pageToken) break;
      }
    } catch (err: any) {
      // If sync token is invalid, fall back to a full sync.
      if (err?.status === 410 && syncToken) {
        job.log(`syncToken invalid for calendarId=${calendarId}; clearing and retrying full sync`);
        syncToken = null;
        pageToken = undefined;

        while (true) {
          const res = await googleCalendarListEvents({
            accessToken,
            calendarId,
            syncToken: null,
            timeMin,
            timeMax,
            pageToken,
          });
          const items = res.items ?? [];
          pageToken = res.nextPageToken;
          nextSyncToken = res.nextSyncToken;

          for (const e of items) {
            if (!e.id || !e.etag) continue;
            const startsAt = parseEventTime(e.start);
            const endsAt = parseEventTime(e.end);

            await db
              .insert(calendarEvents)
              .values({
                companyId: integration.companyId,
                integrationId,
                calendarId,
                googleEventId: e.id,
                etag: e.etag,
                title: e.summary ?? "(No title)",
                startsAt,
                endsAt,
                status: e.status ?? "unknown",
                attendeesJson: e.attendees ?? [],
                hangoutLink: e.hangoutLink ?? null,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  calendarEvents.integrationId,
                  calendarEvents.calendarId,
                  calendarEvents.googleEventId,
                ],
                set: {
                  etag: e.etag,
                  title: e.summary ?? "(No title)",
                  startsAt,
                  endsAt,
                  status: e.status ?? "unknown",
                  attendeesJson: e.attendees ?? [],
                  hangoutLink: e.hangoutLink ?? null,
                  updatedAt: new Date(),
                },
              });
          }

          if (!pageToken) break;
        }
      } else {
        throw err;
      }
    }

    if (nextSyncToken && channels.length > 0) {
      await db
        .update(calendarChannels)
        .set({ syncToken: nextSyncToken, updatedAt: new Date() })
        .where(eq(calendarChannels.id, ch.id));
    }

    job.log(`calendarSync done calendarId=${calendarId} hasNextSyncToken=${Boolean(nextSyncToken)}`);
  }
}


