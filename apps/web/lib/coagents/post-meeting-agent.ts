import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { agentRuns, meetings } from "@pa-os/db/schema";
import { runPostMeetingGraph } from "@pa-os/agents";

function uuidFromText(text: string): string | null {
  const m = text.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  );
  return m?.[0] ?? null;
}

function emitText(sub: { next: (e: BaseEvent) => void }, messageId: string, content: string) {
  sub.next({ type: EventType.TEXT_MESSAGE_START, role: "assistant", messageId } as any);
  // Small chunks so the UI feels like real streaming
  const chunks = content.match(/[\s\S]{1,48}/g) ?? [content];
  for (const c of chunks) {
    sub.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: c } as any);
  }
  sub.next({ type: EventType.TEXT_MESSAGE_END, messageId } as any);
}

export class LocalPostMeetingAgent extends AbstractAgent {
  override run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      (async () => {
        const runId = input.runId || randomUUID();
        const companyId = input.forwardedProps?.companyId as string | undefined;
        const personId = input.forwardedProps?.personId as string | undefined;
        const meetingIdFromProps = input.forwardedProps?.meetingId as string | undefined;
        const lastUser = [...(input.messages ?? [])].reverse().find((m) => m.role === "user");
        const lastText = typeof lastUser?.content === "string" ? lastUser.content : "";
        const meetingId = meetingIdFromProps ?? uuidFromText(lastText);

        if (!companyId || !personId) {
          emitText(subscriber as any, randomUUID(), "Missing companyId/personId. Please refresh and try again.");
          subscriber.complete();
          return;
        }

        if (!meetingId) {
          emitText(
            subscriber as any,
            randomUUID(),
            "Please provide a meetingId (UUID). Example: “Run post-meeting for meetingId: <uuid>”.",
          );
          subscriber.complete();
          return;
        }

        subscriber.next({ type: EventType.RUN_STARTED, threadId: input.threadId, runId } as any);

        const { db } = getDb();
        const [m] = await db
          .select({ id: meetings.id })
          .from(meetings)
          .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)))
          .limit(1);
        if (!m) {
          emitText(subscriber as any, randomUUID(), "Meeting not found for this company.");
          subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId, result: null } as any);
          subscriber.complete();
          return;
        }

        // Create an agent run row (so approvals can FK properly)
        const [ar] = await db
          .insert(agentRuns)
          .values({
            companyId,
            kind: "MEETING_POST",
            status: "RUNNING",
            threadId: input.threadId,
            inputRefsJson: { meetingId },
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: agentRuns.id });

        if (!ar) {
          emitText(subscriber as any, randomUUID(), "Failed to create agent run.");
          subscriber.complete();
          return;
        }

        emitText(
          subscriber as any,
          randomUUID(),
          `Running post-meeting workflow for meetingId: ${meetingId}\n\nThis may pause for approval.`,
        );

        const result = await runPostMeetingGraph({
          threadId: input.threadId,
          companyId,
          meetingId,
          createdByPersonId: personId,
          agentRunId: ar.id,
        });

        // Emit interrupt as a CUSTOM event so the UI can link to approvals
        if (result.status === "WAITING_APPROVAL") {
          subscriber.next({
            type: EventType.CUSTOM,
            name: "approval_required",
            value: result.interrupt,
          } as any);
          emitText(
            subscriber as any,
            randomUUID(),
            `Approval required. Go to /approvals to review.\n\napprovalId: ${(result.interrupt as any)?.approvalId ?? "unknown"}`,
          );
          await db
            .update(agentRuns)
            .set({ status: "WAITING_APPROVAL", outputJson: result.interrupt as any, updatedAt: new Date() })
            .where(eq(agentRuns.id, ar.id));
          subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId, result } as any);
          subscriber.complete();
          return;
        }

        await db
          .update(agentRuns)
          .set({ status: "COMPLETED", outputJson: result.result as any, updatedAt: new Date() })
          .where(eq(agentRuns.id, ar.id));

        emitText(
          subscriber as any,
          randomUUID(),
          "Post-meeting workflow completed.\n\nMeeting outputs were persisted and any tasks were created if approved.",
        );
        subscriber.next({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId, result } as any);
        subscriber.complete();
      })().catch((err) => {
        subscriber.next({
          type: EventType.RUN_ERROR,
          message: err instanceof Error ? err.message : String(err),
        } as any);
        subscriber.complete();
      });

      return () => {
        // No-op abort for now (local graph run)
      };
    });
  }
}


