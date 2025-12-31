import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { auditLogs, companies, memberships, people } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal("all")]),
  actorType: z.enum(["HUMAN", "AGENT", "SYSTEM"]).optional(),
  action: z
    .enum([
      "TASK_CREATE",
      "TASK_UPDATE",
      "TASK_DELETE",
      "MEETING_FINALIZE",
      "APPROVAL_CREATE",
      "APPROVAL_DECIDE",
      "CALENDAR_EVENT_CREATE",
      "CALENDAR_EVENT_UPDATE",
      "CALENDAR_EVENT_CANCEL",
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get("companyId"),
    actorType: (url.searchParams.get("actorType") ?? undefined) as any,
    action: (url.searchParams.get("action") ?? undefined) as any,
    limit: url.searchParams.get("limit") ?? undefined,
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
    return NextResponse.json({ ok: true, logs: [] });
  }

  if (parsed.data.companyId !== "all" && !allowedCompanyIds.includes(parsed.data.companyId)) {
    return NextResponse.json({ ok: false, error: "No access to that company" }, { status: 403 });
  }

  const whereParts = [inArray(auditLogs.companyId, allowedCompanyIds)];
  if (parsed.data.actorType) whereParts.push(eq(auditLogs.actorType, parsed.data.actorType));
  if (parsed.data.action) whereParts.push(eq(auditLogs.action, parsed.data.action));

  const rows = await db
    .select({
      id: auditLogs.id,
      companyId: auditLogs.companyId,
      companyName: companies.name,
      actorType: auditLogs.actorType,
      actorPersonId: auditLogs.actorPersonId,
      actorName: people.fullName,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadataJson: auditLogs.metadataJson,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(companies, eq(auditLogs.companyId, companies.id))
    .leftJoin(people, eq(auditLogs.actorPersonId, people.id))
    .where(and(...whereParts))
    .orderBy(desc(auditLogs.createdAt))
    .limit(parsed.data.limit ?? 50);

  return NextResponse.json({ ok: true, logs: rows });
}
