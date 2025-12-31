import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, recordAuditLog } from "@pa-os/db";
import { agentRuns, approvals, tasks } from "@pa-os/db/schema";
import { resumePostMeetingGraph } from "@pa-os/agents";

import { getSession } from "@/lib/auth/get-session";
import { hasCompanyRole } from "@/lib/auth/membership";

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
      approvalType: approvals.type,
      approvalPayload: approvals.payloadJson,
      agentRunId: approvals.agentRunId,
      agentRunThreadId: agentRuns.threadId,
      agentRunStatus: agentRuns.status,
      agentRunKind: agentRuns.kind,
    })
    .from(approvals)
    .innerJoin(agentRuns, eq(approvals.agentRunId, agentRuns.id))
    .where(eq(approvals.id, parsed.data.approvalId))
    .limit(1);

  if (!row) return NextResponse.json({ ok: false, error: "Approval not found" }, { status: 404 });
  if (row.approvalCompanyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }
  const canApprove = await hasCompanyRole({
    personId: session.personId,
    companyId: row.approvalCompanyId,
    minRole: "ADMIN",
  });
  if (!canApprove) {
    return NextResponse.json({ ok: false, error: "Insufficient role to approve" }, { status: 403 });
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

  if (row.agentRunKind === "COPILOT_ACTION") {
    const now = new Date();
    if (parsed.data.decision === "REJECT") {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(approvals)
          .set({
            status: "REJECTED",
            reviewerPersonId: session.personId,
            reviewerFeedback: parsed.data.feedback ?? null,
            decidedAt: now,
          })
          .where(eq(approvals.id, row.approvalId))
          .returning({ id: approvals.id });
        if (!updated.length) return;

        await tx
          .update(agentRuns)
          .set({ status: "COMPLETED", outputJson: { decision: "REJECT" } as any, updatedAt: now })
          .where(eq(agentRuns.id, row.agentRunId));

        await recordAuditLog({
          companyId: row.approvalCompanyId,
          actorType: "HUMAN",
          actorPersonId: session.personId,
          action: "APPROVAL_DECIDE",
          targetType: "approval",
          targetId: row.approvalId,
          metadata: { decision: "REJECT" },
          db: tx,
        });
      });

      return NextResponse.json({ ok: true });
    }

    await db.transaction(async (tx) => {
      if (row.approvalType === "CREATE_TASKS") {
        const payload = row.approvalPayload as any;
        const taskList = Array.isArray(payload?.tasks) ? payload.tasks : [];
        for (const t of taskList) {
          const [created] = await tx
            .insert(tasks)
            .values({
              companyId: row.approvalCompanyId,
              title: String(t?.title ?? "Untitled"),
              descriptionMd: String(t?.descriptionMd ?? ""),
              status: (t?.status as any) ?? "TODO",
              priority: (t?.priority as any) ?? "MEDIUM",
              ownerPersonId: t?.ownerPersonId ?? null,
              dueAt: t?.dueAt ? new Date(t.dueAt) : null,
              source: "COPILOT",
              createdByPersonId: session.personId,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: tasks.id });

          if (created?.id) {
            await recordAuditLog({
              companyId: row.approvalCompanyId,
              actorType: "AGENT",
              actorPersonId: session.personId,
              action: "TASK_CREATE",
              targetType: "task",
              targetId: created.id,
              metadata: { source: "COPILOT", approvalId: row.approvalId },
              db: tx,
            });
          }
        }
      }

      if (row.approvalType === "UPDATE_TASKS") {
        const payload = row.approvalPayload as any;
        const updates = Array.isArray(payload?.updates) ? payload.updates : [];
        for (const u of updates) {
          const patch = u?.patch ?? {};
          const update: Record<string, unknown> = { updatedAt: now };
          if (typeof patch.title === "string") update.title = patch.title;
          if (typeof patch.descriptionMd === "string") update.descriptionMd = patch.descriptionMd;
          if (typeof patch.status === "string") update.status = patch.status;
          if (typeof patch.priority === "string") update.priority = patch.priority;
          if (patch.ownerPersonId !== undefined) update.ownerPersonId = patch.ownerPersonId ?? null;
          if (patch.dueAt !== undefined) update.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;

          const [updated] = await tx
            .update(tasks)
            .set(update)
            .where(and(eq(tasks.id, u.taskId), eq(tasks.companyId, row.approvalCompanyId)))
            .returning({ id: tasks.id });

          if (updated?.id) {
            await recordAuditLog({
              companyId: row.approvalCompanyId,
              actorType: "AGENT",
              actorPersonId: session.personId,
              action: "TASK_UPDATE",
              targetType: "task",
              targetId: updated.id,
              metadata: { source: "COPILOT", approvalId: row.approvalId },
              db: tx,
            });
          }
        }
      }

      await tx
        .update(approvals)
        .set({
          status: "APPROVED",
          reviewerPersonId: session.personId,
          reviewerFeedback: parsed.data.feedback ?? null,
          decidedAt: now,
        })
        .where(eq(approvals.id, row.approvalId));

      await tx
        .update(agentRuns)
        .set({ status: "COMPLETED", outputJson: { decision: "APPROVE" } as any, updatedAt: now })
        .where(eq(agentRuns.id, row.agentRunId));

      await recordAuditLog({
        companyId: row.approvalCompanyId,
        actorType: "HUMAN",
        actorPersonId: session.personId,
        action: "APPROVAL_DECIDE",
        targetType: "approval",
        targetId: row.approvalId,
        metadata: { decision: "APPROVE" },
        db: tx,
      });
    });

    return NextResponse.json({ ok: true });
  }

  const result = await resumePostMeetingGraph({
    threadId: row.agentRunThreadId,
    resume,
  });

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(agentRuns)
      .set({ status: "COMPLETED", outputJson: result as any, updatedAt: new Date() })
      .where(eq(agentRuns.id, row.agentRunId))
      .returning({ id: agentRuns.id });
    if (!updated.length) return;

    await recordAuditLog({
      companyId: row.approvalCompanyId,
      actorType: "HUMAN",
      actorPersonId: session.personId,
      action: "APPROVAL_DECIDE",
      targetType: "approval",
      targetId: row.approvalId,
      metadata: { decision: parsed.data.decision },
      db: tx,
    });
  });

  return NextResponse.json({ ok: true });
}
