import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { integrations } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { getQueues } from "@/lib/queues";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  integrationId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get("companyId") ?? undefined,
    integrationId: url.searchParams.get("integrationId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const companyId = parsed.data.companyId ?? session.companyId;
  if (companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  const { db } = getDb();
  const [integration] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(
      parsed.data.integrationId
        ? and(eq(integrations.id, parsed.data.integrationId), eq(integrations.companyId, companyId))
        : and(eq(integrations.companyId, companyId), eq(integrations.provider, "google")),
    )
    .limit(1);

  if (!integration) {
    return NextResponse.json({ ok: false, error: "No Google integration found" }, { status: 404 });
  }

  const queues = getQueues();
  await queues.calendarSync.add("sync", { integrationId: integration.id });

  return NextResponse.json({ ok: true, enqueued: true });
}


