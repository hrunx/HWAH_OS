import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { memberships, people } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { isCompanyMember } from "@/lib/auth/membership";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  title: z.string().max(200).optional().nullable(),
  role: z.enum(["OWNER", "MEMBER"]).optional().default("MEMBER"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (!(await isCompanyMember({ personId: session.personId, companyId: parsed.data.companyId }))) {
    return NextResponse.json({ ok: false, error: "No access to that company" }, { status: 403 });
  }

  const { db } = getDb();

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, parsed.data.email))
      .limit(1);

    const personId =
      existing?.id ??
      (
        await tx
          .insert(people)
          .values({
            fullName: parsed.data.fullName,
            email: parsed.data.email,
            title: parsed.data.title ?? null,
            createdAt: new Date(),
          })
          .returning({ id: people.id })
      )[0]!.id;

    await tx
      .insert(memberships)
      .values({
        companyId: parsed.data.companyId,
        personId,
        role: parsed.data.role,
        createdAt: new Date(),
      })
      .onConflictDoNothing({
        target: [memberships.companyId, memberships.personId],
      });

    const [row] = await tx
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
      .where(and(eq(memberships.companyId, parsed.data.companyId), eq(people.id, personId)))
      .limit(1);

    return row;
  });

  return NextResponse.json({ ok: true, person: created });
}


