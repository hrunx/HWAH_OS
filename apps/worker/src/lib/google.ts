import { decryptString, encryptString } from "./crypto.js";

export type GoogleTokenBundle = {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
};

export async function refreshAccessTokenIfNeeded(input: {
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  tokenExpiresAt: Date | null;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { didRefresh: false as const, accessTokenEnc: input.accessTokenEnc, tokenExpiresAt: input.tokenExpiresAt };
  }

  const now = Date.now();
  const expiresAtMs = input.tokenExpiresAt ? new Date(input.tokenExpiresAt).getTime() : null;
  const needsRefresh = expiresAtMs !== null && expiresAtMs - now < 60_000;

  if (!needsRefresh) {
    return { didRefresh: false as const, accessTokenEnc: input.accessTokenEnc, tokenExpiresAt: input.tokenExpiresAt };
  }

  if (!input.refreshTokenEnc) {
    return { didRefresh: false as const, accessTokenEnc: input.accessTokenEnc, tokenExpiresAt: input.tokenExpiresAt };
  }

  const refreshToken = decryptString(input.refreshTokenEnc);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const accessTokenEnc = encryptString(json.access_token);
  const tokenExpiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : input.tokenExpiresAt;

  return { didRefresh: true as const, accessTokenEnc, tokenExpiresAt };
}

export async function googleCalendarListEvents(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  timeMin?: string;
  timeMax?: string;
  pageToken?: string;
}) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("maxResults", "2500");

  if (input.syncToken) url.searchParams.set("syncToken", input.syncToken);
  if (input.timeMin) url.searchParams.set("timeMin", input.timeMin);
  if (input.timeMax) url.searchParams.set("timeMax", input.timeMax);
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Google events.list failed (${res.status}): ${text}`);
    // Attach status for handling 410 "Gone" (invalid sync token)
    (err as any).status = res.status;
    throw err;
  }

  return (await res.json()) as {
    items?: Array<{
      id: string;
      etag: string;
      status: string;
      summary?: string;
      hangoutLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: unknown[];
    }>;
    nextPageToken?: string;
    nextSyncToken?: string;
  };
}


