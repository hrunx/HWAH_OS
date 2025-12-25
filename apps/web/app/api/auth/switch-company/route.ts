import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { memberships } from "@pa-os/db/schema";
import { cookies } from "next/headers";

import { createSessionToken, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { VIEW_COMPANY_COOKIE_NAME } from "@/lib/auth/view-company";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal("all")]),
});

export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // "All companies" is a view mode. Keep the auth session companyId as-is, just set the view cookie.
  if (parsed.data.companyId === "all") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(VIEW_COMPANY_COOKIE_NAME, "all", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res;
  }

  const { db } = getDb();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.personId, session.personId), eq(memberships.companyId, parsed.data.companyId)))
    .limit(1);

  if (!m) {
    return NextResponse.json({ ok: false, error: "No access to that company" }, { status: 403 });
  }

  const newToken = await createSessionToken({
    personId: session.personId,
    companyId: parsed.data.companyId,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.cookies.set(VIEW_COMPANY_COOKIE_NAME, parsed.data.companyId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}


