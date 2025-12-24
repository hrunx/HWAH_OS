import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarEvents, tasks } from "@pa-os/db/schema";

import { calendarCaptainGeneratePrepPack } from "../specialists/calendarCaptain";

const MeetingPrepState = Annotation.Root({
  companyId: Annotation<string>(),
  calendarEventId: Annotation<string>(),
  event: Annotation<any>(),
  relatedTasks: Annotation<any[]>({
    reducer: (_left, right) => (Array.isArray(right) ? right : []),
    default: () => [],
  }),
  output: Annotation<any>(),
});

export async function runMeetingPrepGraph(input: { companyId: string; calendarEventId: string }) {
  const graph = new StateGraph(MeetingPrepState)
    .addNode("load_event", async (state) => {
      const { db } = getDb();
      const [ev] = await db
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          startsAt: calendarEvents.startsAt,
          endsAt: calendarEvents.endsAt,
        })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, state.calendarEventId), eq(calendarEvents.companyId, state.companyId)))
        .limit(1);
      if (!ev) throw new Error("Calendar event not found");
      return {
        event: {
          id: ev.id,
          title: ev.title,
          startsAt: ev.startsAt.toISOString(),
          endsAt: ev.endsAt.toISOString(),
        },
      };
    })
    .addNode("load_related_tasks", async (state) => {
      const { db } = getDb();
      const kw = String(state.event?.title ?? "").split(/\s+/).slice(0, 4).join(" ").trim();
      if (!kw) return { relatedTasks: [] };
      const rows = await db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(
          and(eq(tasks.companyId, state.companyId), or(ilike(tasks.title, `%${kw}%`), ilike(tasks.descriptionMd, `%${kw}%`))!),
        )
        .limit(8);
      return { relatedTasks: rows };
    })
    .addNode("calendar_captain_generate_prep_pack", async (state) => {
      const output = await calendarCaptainGeneratePrepPack({
        event: state.event,
        relatedTasks: state.relatedTasks,
      });
      return { output };
    })
    .addEdge(START, "load_event")
    .addEdge("load_event", "load_related_tasks")
    .addEdge("load_related_tasks", "calendar_captain_generate_prep_pack")
    .addEdge("calendar_captain_generate_prep_pack", END)
    .compile();

  const result = await graph.invoke({
    companyId: input.companyId,
    calendarEventId: input.calendarEventId,
    event: null,
    relatedTasks: [],
    output: null,
  });

  return result.output;
}


