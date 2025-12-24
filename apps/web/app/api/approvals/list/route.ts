import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { approvals } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const QuerySchema = z.object({
  companyId: z.string().uuid(),
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

  if (parsed.data.companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  const where = [eq(approvals.companyId, parsed.data.companyId)];
  const allowedStatus = new Set(["PENDING", "APPROVED", "REJECTED"]);
  if (parsed.data.status && allowedStatus.has(parsed.data.status)) {
    where.push(eq(approvals.status, parsed.data.status as any));
  }

  const { db } = getDb();
  const rows = await db
    .select({
      id: approvals.id,
      companyId: approvals.companyId,
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
    .where(and(...where))
    .orderBy(desc(approvals.createdAt));

  return NextResponse.json({ ok: true, approvals: rows });
}


