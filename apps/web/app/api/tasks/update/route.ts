import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { isCompanyMember } from "@/lib/auth/membership";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    descriptionMd: z.string().optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    ownerPersonId: z.string().uuid().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  .strict();

const BodySchema = z.object({
  taskId: z.string().uuid(),
  patch: PatchSchema,
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { db } = getDb();
  const [existing] = await db
    .select({ id: tasks.id, companyId: tasks.companyId })
    .from(tasks)
    .where(eq(tasks.id, parsed.data.taskId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  if (!(await isCompanyMember({ personId: session.personId, companyId: existing.companyId }))) {
    return NextResponse.json({ ok: false, error: "No access to that company" }, { status: 403 });
  }

  const patch = parsed.data.patch;
  const update: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (typeof patch.title === "string") update.title = patch.title;
  if (typeof patch.descriptionMd === "string") update.descriptionMd = patch.descriptionMd;
  if (patch.status) update.status = patch.status;
  if (patch.priority) update.priority = patch.priority;
  if (patch.ownerPersonId !== undefined) update.ownerPersonId = patch.ownerPersonId ?? null;
  if (patch.projectId !== undefined) update.projectId = patch.projectId ?? null;
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;

  const [updated] = await db
    .update(tasks)
    .set(update)
    .where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.companyId, existing.companyId)))
    .returning();

  return NextResponse.json({ ok: true, task: updated });
}


