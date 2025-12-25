import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@pa-os/db";
import { tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { isCompanyMember } from "@/lib/auth/membership";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  descriptionMd: z.string().optional().default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  ownerPersonId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  source: z.string().optional(),
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

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined;

  const { db } = getDb();
  const [created] = await db
    .insert(tasks)
    .values({
      companyId: parsed.data.companyId,
      projectId: parsed.data.projectId ?? undefined,
      title: parsed.data.title,
      descriptionMd: parsed.data.descriptionMd ?? "",
      status: parsed.data.status ?? "TODO",
      priority: parsed.data.priority ?? "MEDIUM",
      ownerPersonId: parsed.data.ownerPersonId ?? undefined,
      dueAt,
      source: parsed.data.source ?? "MANUAL",
      createdByPersonId: session.personId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json({ ok: true, task: created });
}


