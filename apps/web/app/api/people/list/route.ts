import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { memberships, people } from "@pa-os/db/schema";

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
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      title: people.title,
      createdAt: people.createdAt,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(people, eq(memberships.personId, people.id))
    .where(and(eq(memberships.companyId, parsed.data.companyId)))
    .orderBy(people.fullName);

  return NextResponse.json({ ok: true, people: rows });
}


