import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { companies, meetings, memberships } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal("all")]),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ companyId: url.searchParams.get("companyId") });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const { db } = getDb();
  const allowedCompanyIds =
    parsed.data.companyId === "all"
      ? (
          await db
            .select({ companyId: memberships.companyId })
            .from(memberships)
            .where(eq(memberships.personId, session.personId))
        ).map((r) => r.companyId)
      : [parsed.data.companyId];

  if (!allowedCompanyIds.length) {
    return NextResponse.json({ ok: true, meetings: [] });
  }

  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      state: meetings.state,
      companyId: meetings.companyId,
      companyName: companies.name,
    })
    .from(meetings)
    .innerJoin(companies, eq(meetings.companyId, companies.id))
    .where(inArray(meetings.companyId, allowedCompanyIds))
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


