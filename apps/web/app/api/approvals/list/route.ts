import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { approvals, companies, memberships } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal("all")]),
  status: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    companyId: url.searchParams.get("companyId"),
    status: url.searchParams.get("status") ?? undefined,
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
    return NextResponse.json({ ok: true, approvals: [] });
  }

  const where = [inArray(approvals.companyId, allowedCompanyIds)];
  const allowedStatus = new Set(["PENDING", "APPROVED", "REJECTED"]);
  if (parsed.data.status && allowedStatus.has(parsed.data.status)) {
    where.push(eq(approvals.status, parsed.data.status as any));
  }

  const rows = await db
    .select({
      id: approvals.id,
      companyId: approvals.companyId,
      companyName: companies.name,
      agentRunId: approvals.agentRunId,
      type: approvals.type,
      status: approvals.status,
      payloadJson: approvals.payloadJson,
      reviewerPersonId: approvals.reviewerPersonId,
      reviewerFeedback: approvals.reviewerFeedback,
      createdAt: approvals.createdAt,
      decidedAt: approvals.decidedAt,
    })
    .from(approvals)
    .innerJoin(companies, eq(approvals.companyId, companies.id))
    .where(and(...where))
    .orderBy(desc(approvals.createdAt));

  return NextResponse.json({ ok: true, approvals: rows });
}


