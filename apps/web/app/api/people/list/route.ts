import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { companies, memberships, people } from "@pa-os/db/schema";

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
    return NextResponse.json({ ok: true, people: [] });
  }

  const rows = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      title: people.title,
      createdAt: people.createdAt,
      role: memberships.role,
      companyId: memberships.companyId,
      companyName: companies.name,
    })
    .from(memberships)
    .innerJoin(people, eq(memberships.personId, people.id))
    .innerJoin(companies, eq(memberships.companyId, companies.id))
    .where(inArray(memberships.companyId, allowedCompanyIds))
    .orderBy(people.fullName);

  // If user is viewing "all", dedupe by personId (same person can be in multiple companies).
  if (parsed.data.companyId === "all") {
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    return NextResponse.json({ ok: true, people: deduped });
  }

  return NextResponse.json({ ok: true, people: rows });
}


