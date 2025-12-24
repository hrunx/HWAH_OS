import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, seedDb } from "@pa-os/db";
import { and, eq } from "drizzle-orm";
import { memberships, people } from "@pa-os/db/schema";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const adminPassword = process.env.LOCAL_ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, error: "LOCAL_ADMIN_PASSWORD is not set" },
      { status: 500 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.password !== adminPassword) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  // Ensure a usable baseline dataset exists (idempotent).
  await seedDb();

  const { db } = getDb();
  const [owner] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, "owner@pa-os.local"))
    .limit(1);

  if (!owner) {
    return NextResponse.json(
      { ok: false, error: "Seed did not create owner user" },
      { status: 500 },
    );
  }

  const [membership] = await db
    .select({ companyId: memberships.companyId })
    .from(memberships)
    .where(and(eq(memberships.personId, owner.id), eq(memberships.role, "OWNER")))
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Owner has no company membership" },
      { status: 500 },
    );
  }

  const token = await createSessionToken({
    personId: owner.id,
    companyId: membership.companyId,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}


