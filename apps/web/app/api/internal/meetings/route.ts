import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.string().uuid(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ companyId: url.searchParams.get("companyId") });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  if (parsed.data.companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  const { db } = getDb();
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      state: meetings.state,
    })
    .from(meetings)
    .where(eq(meetings.companyId, session.companyId))
    .orderBy(desc(meetings.startsAt))
    .limit(50);

  return NextResponse.json({
    ok: true,
    meetings: rows.map((m) => ({
      ...m,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
    })),
  });
}


