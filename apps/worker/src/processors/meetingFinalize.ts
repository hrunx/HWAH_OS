import type { Job } from "bullmq";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@pa-os/db";
import { agentRuns, meetings } from "@pa-os/db/schema";
import { runPostMeetingGraph } from "@pa-os/agents";

const JobSchema = z.object({
  meetingId: z.string().uuid(),
  companyId: z.string().uuid(),
  createdByPersonId: z.string().uuid(),
});

export async function meetingFinalizeProcessor(job: Job) {
  const parsed = JobSchema.safeParse(job.data);
  if (!parsed.success) {
    job.log("Invalid job payload");
    return;
  }

  const { meetingId, companyId, createdByPersonId } = parsed.data;
  job.log(`meetingFinalize start meetingId=${meetingId}`);

  const { db } = getDb();

  const [meeting] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)))
    .limit(1);

  if (!meeting) {
    job.log("meeting not found; skipping");
    return;
  }

  const now = new Date();
  const threadId = randomUUID();

  const [run] = await db
    .insert(agentRuns)
    .values({
      companyId,
      kind: "MEETING_POST",
      status: "RUNNING",
      threadId,
      inputRefsJson: { meetingId },
      outputJson: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: agentRuns.id, threadId: agentRuns.threadId });
  if (!run) throw new Error("Failed to create agent run");

  try {
    const result = await runPostMeetingGraph({
      threadId: run.threadId,
      companyId,
      meetingId,
      createdByPersonId,
      agentRunId: run.id,
    });

    if (result.status === "WAITING_APPROVAL") {
      await db
        .update(agentRuns)
        .set({
          status: "WAITING_APPROVAL",
          outputJson: result.interrupt as any,
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));
      await db.update(meetings).set({ state: "READY" }).where(eq(meetings.id, meetingId));
      job.log("meetingFinalize waiting approval");
      return;
    }

    await db
      .update(agentRuns)
      .set({
        status: "COMPLETED",
        outputJson: result.result as any,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    await db.update(meetings).set({ state: "READY" }).where(eq(meetings.id, meetingId));
    job.log("meetingFinalize completed");
  } catch (e: any) {
    await db
      .update(agentRuns)
      .set({ status: "FAILED", outputJson: { error: String(e?.message ?? e) } as any, updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    job.log(`meetingFinalize failed: ${String(e?.message ?? e)}`);
    throw e;
  }
}


