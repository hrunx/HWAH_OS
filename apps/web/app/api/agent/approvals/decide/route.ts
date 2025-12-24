import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { agentRuns, approvals } from "@pa-os/db/schema";
import { resumePostMeetingGraph } from "@pa-os/agents";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const BodySchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  editedPayload: z.any().optional(),
  feedback: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { db } = getDb();
  const [row] = await db
    .select({
      approvalId: approvals.id,
      approvalCompanyId: approvals.companyId,
      approvalStatus: approvals.status,
      agentRunId: approvals.agentRunId,
      agentRunThreadId: agentRuns.threadId,
      agentRunStatus: agentRuns.status,
    })
    .from(approvals)
    .innerJoin(agentRuns, eq(approvals.agentRunId, agentRuns.id))
    .where(eq(approvals.id, parsed.data.approvalId))
    .limit(1);

  if (!row) return NextResponse.json({ ok: false, error: "Approval not found" }, { status: 404 });
  if (row.approvalCompanyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }
  if (row.approvalStatus !== "PENDING") {
    return NextResponse.json({ ok: false, error: "Approval already decided" }, { status: 400 });
  }

  const resume = {
    decision: parsed.data.decision,
    editedPayload: parsed.data.editedPayload,
    feedback: parsed.data.feedback,
    reviewerPersonId: session.personId,
  } as any;

  const result = await resumePostMeetingGraph({
    threadId: row.agentRunThreadId,
    resume,
  });

  await db
    .update(agentRuns)
    .set({ status: "COMPLETED", outputJson: result as any, updatedAt: new Date() })
    .where(eq(agentRuns.id, row.agentRunId));

  return NextResponse.json({ ok: true });
}


