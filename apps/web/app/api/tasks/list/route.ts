import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { companies, memberships, people, tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal("all")]),
  status: z.string().optional(),
  owner: z.string().uuid().optional(),
  q: z.string().optional(),
  priority: z.string().optional(),
  due: z.enum(["overdue", "today", "this_week"]).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get("companyId"),
    status: url.searchParams.get("status") ?? undefined,
    owner: url.searchParams.get("owner") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    due: (url.searchParams.get("due") ?? undefined) as any,
  });

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
    return NextResponse.json({ ok: true, tasks: [] });
  }

  // If user asked for a specific company, enforce membership.
  if (parsed.data.companyId !== "all" && !allowedCompanyIds.includes(parsed.data.companyId)) {
    return NextResponse.json({ ok: false, error: "No access to that company" }, { status: 403 });
  }

  const whereParts = [inArray(tasks.companyId, allowedCompanyIds)];

  const allowedStatus = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
  if (parsed.data.status && allowedStatus.has(parsed.data.status)) {
    whereParts.push(eq(tasks.status, parsed.data.status as any));
  }

  const allowedPriority = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
  if (parsed.data.priority && allowedPriority.has(parsed.data.priority)) {
    whereParts.push(eq(tasks.priority, parsed.data.priority as any));
  }

  if (parsed.data.owner) {
    whereParts.push(eq(tasks.ownerPersonId, parsed.data.owner));
  }

  if (parsed.data.q && parsed.data.q.trim()) {
    const q = `%${parsed.data.q.trim()}%`;
    whereParts.push(or(ilike(tasks.title, q), ilike(tasks.descriptionMd, q))!);
  }

  const now = new Date();
  // For due filters we post-filter in-memory for simplicity (null-safe). The dataset is small locally.

  const rows = await db
    .select({
      id: tasks.id,
      companyId: tasks.companyId,
      companyName: companies.name,
      projectId: tasks.projectId,
      title: tasks.title,
      descriptionMd: tasks.descriptionMd,
      status: tasks.status,
      priority: tasks.priority,
      ownerPersonId: tasks.ownerPersonId,
      dueAt: tasks.dueAt,
      source: tasks.source,
      createdByPersonId: tasks.createdByPersonId,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      ownerName: people.fullName,
    })
    .from(tasks)
    .innerJoin(companies, eq(tasks.companyId, companies.id))
    .leftJoin(people, eq(tasks.ownerPersonId, people.id))
    .where(and(...whereParts))
    .orderBy(tasks.dueAt, tasks.createdAt);

  const filtered = rows.filter((t) => {
    if (!parsed.data.due) return true;
    if (!t.dueAt) return false;
    const due = new Date(t.dueAt);
    if (parsed.data.due === "overdue") return due.getTime() < now.getTime() && t.status !== "DONE";
    if (parsed.data.due === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return due >= start && due < end;
    }
    if (parsed.data.due === "this_week") {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      return due >= now && due <= end;
    }
    return true;
  });

  return NextResponse.json({ ok: true, tasks: filtered });
}


