import { Annotation, Command, END, interrupt, isGraphInterrupt, START, StateGraph } from "@langchain/langgraph";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { approvals, meetingAssets, meetingOutputs, meetings, tasks, transcripts } from "@pa-os/db/schema";

import { meetingScribeGenerate, type MeetingBookmark } from "../specialists/meetingScribe.js";
import { PostgresCheckpointer } from "../langgraph/postgresCheckpointer.js";

type CreateTasksPayload = {
  tasks: Array<{
    title: string;
    descriptionMd?: string;
    priority?: string;
    dueAt?: string;
    ownerPersonId?: string;
  }>;
};

const PostMeetingState = Annotation.Root({
  companyId: Annotation<string>(),
  meetingId: Annotation<string>(),
  createdByPersonId: Annotation<string>(),
  agentRunId: Annotation<string>(),
  transcriptFullText: Annotation<string>(),
  transcriptSegments: Annotation<any[]>({
    reducer: (_left, right) => (Array.isArray(right) ? right : []),
    default: () => [],
  }),
  bookmarks: Annotation<MeetingBookmark[]>({
    reducer: (_left, right) => (Array.isArray(right) ? right : []),
    default: () => [],
  }),
  scribe: Annotation<any>(),
  approvalId: Annotation<string>(),
  approvalPayload: Annotation<any>(),
  resumeDecision: Annotation<any>(),
});

export type PostMeetingResume = {
  decision: "APPROVE" | "REJECT";
  editedPayload?: CreateTasksPayload;
  feedback?: string;
  reviewerPersonId?: string;
};

export function getPostMeetingGraph() {
  const checkpointer = new PostgresCheckpointer();

  const graph = new StateGraph(PostMeetingState)
    .addNode("load_context", async (state) => {
      const { db } = getDb();
      const [m] = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.id, state.meetingId), eq(meetings.companyId, state.companyId)))
        .limit(1);
      if (!m) throw new Error("Meeting not found");
      return {};
    })
    .addNode("load_transcript", async (state) => {
      const { db } = getDb();
      const [t] = await db
        .select({
          fullText: transcripts.fullText,
          segmentsJson: transcripts.segmentsJson,
        })
        .from(transcripts)
        .where(eq(transcripts.meetingId, state.meetingId))
        .orderBy(desc(transcripts.createdAt))
        .limit(1);
      if (!t) throw new Error("Transcript not found");

      const [bm] = await db
        .select({ metadataJson: meetingAssets.metadataJson })
        .from(meetingAssets)
        .where(and(eq(meetingAssets.meetingId, state.meetingId), eq(meetingAssets.type, "BOOKMARKS")))
        .orderBy(desc(meetingAssets.createdAt))
        .limit(1);

      return {
        transcriptFullText: t.fullText,
        transcriptSegments: (t.segmentsJson as any) ?? [],
        bookmarks: ((bm?.metadataJson as any)?.bookmarks as MeetingBookmark[]) ?? [],
      };
    })
    .addNode("meeting_scribe_generate", async (state) => {
      const scribe = await meetingScribeGenerate({
        transcriptFullText: state.transcriptFullText,
        segments: state.transcriptSegments,
        bookmarks: state.bookmarks,
        companyContext: { companyId: state.companyId },
      });
      return { scribe };
    })
    .addNode("create_createTasks_approval", async (state) => {
      const { db } = getDb();
      const payload: CreateTasksPayload = state.scribe.createTasksProposal ?? { tasks: [] };
      const [approval] = await db
        .insert(approvals)
        .values({
          companyId: state.companyId,
          agentRunId: state.agentRunId,
          type: "CREATE_TASKS",
          payloadJson: payload as any,
          status: "PENDING",
          reviewerPersonId: null,
          reviewerFeedback: null,
          createdAt: new Date(),
          decidedAt: null,
        })
        .returning({ id: approvals.id });

      if (!approval) throw new Error("Failed to create approval");
      return { approvalId: approval.id, approvalPayload: payload };
    })
    .addNode("interrupt_wait_for_approval", async (state) => {
      const resume = interrupt({
        approvalId: state.approvalId,
        payload: state.approvalPayload,
      }) as PostMeetingResume;
      return { resumeDecision: resume };
    })
    .addNode("apply_approval_decision", async (state) => {
      const { db } = getDb();
      const resume = state.resumeDecision as PostMeetingResume;
      if (!resume?.decision) throw new Error("Missing approval decision");

      const now = new Date();

      if (resume.decision === "REJECT") {
        await db
          .update(approvals)
          .set({
            status: "REJECTED",
            reviewerPersonId: resume.reviewerPersonId ?? null,
            reviewerFeedback: resume.feedback ?? null,
            decidedAt: now,
          })
          .where(eq(approvals.id, state.approvalId));
        return {};
      }

      const payload = (resume.editedPayload ?? state.approvalPayload) as CreateTasksPayload;
      const taskRows = payload.tasks ?? [];

      for (const t of taskRows) {
        await db.insert(tasks).values({
          companyId: state.companyId,
          title: t.title,
          descriptionMd: t.descriptionMd ?? "",
          status: "TODO",
          priority: (t.priority as any) ?? "MEDIUM",
          ownerPersonId: t.ownerPersonId ?? null,
          dueAt: t.dueAt ? new Date(t.dueAt) : null,
          source: "MEETING",
          createdByPersonId: state.createdByPersonId,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db
        .update(approvals)
        .set({
          status: "APPROVED",
          reviewerPersonId: resume.reviewerPersonId ?? null,
          reviewerFeedback: resume.feedback ?? null,
          decidedAt: now,
          payloadJson: payload as any,
        })
        .where(eq(approvals.id, state.approvalId));

      return {};
    })
    .addNode("persist_meeting_outputs", async (state) => {
      const { db } = getDb();
      const scribe = state.scribe;
      await db
        .insert(meetingOutputs)
        .values({
          meetingId: state.meetingId,
          minutesMd: scribe.minutesMd ?? "",
          decisionsJson: (scribe.decisionsJson ?? []) as any,
          actionItemsJson: (scribe.actionItemsJson ?? []) as any,
          risksJson: (scribe.risksJson ?? []) as any,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: meetingOutputs.meetingId,
          set: {
            minutesMd: scribe.minutesMd ?? "",
            decisionsJson: (scribe.decisionsJson ?? []) as any,
            actionItemsJson: (scribe.actionItemsJson ?? []) as any,
            risksJson: (scribe.risksJson ?? []) as any,
          },
        });
      return {};
    })
    .addEdge(START, "load_context")
    .addEdge("load_context", "load_transcript")
    .addEdge("load_transcript", "meeting_scribe_generate")
    .addEdge("meeting_scribe_generate", "create_createTasks_approval")
    .addEdge("create_createTasks_approval", "interrupt_wait_for_approval")
    .addEdge("interrupt_wait_for_approval", "apply_approval_decision")
    .addEdge("apply_approval_decision", "persist_meeting_outputs")
    .addEdge("persist_meeting_outputs", END)
    .compile({ checkpointer });

  return graph;
}

export async function runPostMeetingGraph(input: {
  threadId: string;
  companyId: string;
  meetingId: string;
  createdByPersonId: string;
  agentRunId: string;
}) {
  const graph = getPostMeetingGraph();
  try {
    const result = await graph.invoke(
      {
        companyId: input.companyId,
        meetingId: input.meetingId,
        createdByPersonId: input.createdByPersonId,
        agentRunId: input.agentRunId,
        transcriptFullText: "",
        transcriptSegments: [],
        bookmarks: [],
        scribe: null,
        approvalId: "",
        approvalPayload: null,
        resumeDecision: null,
      },
      { configurable: { thread_id: input.threadId, checkpoint_ns: "" } },
    );
    return { status: "COMPLETED" as const, result };
  } catch (e: any) {
    if (isGraphInterrupt(e)) {
      const first = e.interrupts?.[0];
      return {
        status: "WAITING_APPROVAL" as const,
        interrupt: first?.value,
      };
    }
    throw e;
  }
}

export async function resumePostMeetingGraph(input: {
  threadId: string;
  resume: PostMeetingResume;
}) {
  const graph = getPostMeetingGraph();
  const result = await graph.invoke(new Command({ resume: input.resume }) as any, {
    configurable: { thread_id: input.threadId, checkpoint_ns: "" },
  });
  return result;
}


