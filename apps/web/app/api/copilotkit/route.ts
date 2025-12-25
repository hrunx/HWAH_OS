import OpenAI from "openai";
import { copilotRuntimeNextJSAppRouterEndpoint, CopilotRuntime, OpenAIAdapter } from "@copilotkit/runtime";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { calendarEvents, meetings, memberships, people, tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

function requireUuid(value: unknown, fieldName: string) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new Error(`${fieldName} must be a UUID`);
  }
  return parsed.data;
}

async function assertMembership(params: { companyId: string; personId: string }) {
  const { db } = getDb();
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.companyId, params.companyId), eq(memberships.personId, params.personId)),
  });
  if (!membership) {
    throw new Error("Forbidden: user is not a member of this company");
  }
}

const copilotRuntime = new CopilotRuntime<any>({
  actions: ({ properties }) => {
    const companyId = properties?.companyId;
    const personId = properties?.personId;
    if (!companyId || !personId) return [];

    const companyIdParsed = requireUuid(companyId, "companyId");
    const personIdParsed = requireUuid(personId, "personId");

    return [
      {
        name: "listTasks",
        description: "List tasks for the current company (optionally filter by status and search query).",
        parameters: [
          {
            name: "status",
            type: "string",
            required: false,
            enum: ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"],
            description: "Optional status filter.",
          },
          {
            name: "query",
            type: "string",
            required: false,
            description: "Optional search query (matches title).",
          },
          {
            name: "limit",
            type: "number",
            required: false,
            description: "Max number of tasks to return (default 20).",
          },
        ],
        handler: async ({ status, query, limit }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();

          const where = and(
            eq(tasks.companyId, companyIdParsed),
            status ? eq(tasks.status, status as any) : undefined,
            query ? ilike(tasks.title, `%${query}%`) : undefined,
          );

          const rows = await db
            .select({
              id: tasks.id,
              title: tasks.title,
              status: tasks.status,
              priority: tasks.priority,
              dueAt: tasks.dueAt,
              ownerPersonId: tasks.ownerPersonId,
              createdAt: tasks.createdAt,
            })
            .from(tasks)
            .where(where)
            .orderBy(desc(tasks.updatedAt))
            .limit(typeof limit === "number" && limit > 0 ? Math.min(limit, 50) : 20);

          return { ok: true, tasks: rows };
        },
      },
      {
        name: "updateTask",
        description: "Update a task in the current company (title, status, priority, due date, owner).",
        parameters: [
          { name: "taskId", type: "string", required: true, description: "Task ID (UUID)." },
          {
            name: "patch",
            type: "object",
            required: true,
            description: "Fields to update.",
            attributes: [
              { name: "title", type: "string", required: false },
              { name: "descriptionMd", type: "string", required: false },
              { name: "status", type: "string", required: false, enum: ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"] },
              { name: "priority", type: "string", required: false, enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
              { name: "ownerPersonId", type: "string", required: false, description: "UUID or null." },
              { name: "dueAt", type: "string", required: false, description: "ISO string or null." },
            ],
          },
        ],
        handler: async ({ taskId, patch }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();

          const idParsed = requireUuid(taskId, "taskId");
          const existing = await db.query.tasks.findFirst({
            where: and(eq(tasks.id, idParsed), eq(tasks.companyId, companyIdParsed)),
          });
          if (!existing) throw new Error("Task not found");

          const update: Record<string, unknown> = { updatedAt: new Date() };
          if (patch && typeof patch === "object") {
            const p = patch as any;
            if (typeof p.title === "string" && p.title.trim()) update.title = p.title.trim();
            if (typeof p.descriptionMd === "string") update.descriptionMd = p.descriptionMd;
            if (typeof p.status === "string") update.status = p.status;
            if (typeof p.priority === "string") update.priority = p.priority;
            if (p.ownerPersonId === null) update.ownerPersonId = null;
            if (typeof p.ownerPersonId === "string") update.ownerPersonId = requireUuid(p.ownerPersonId, "ownerPersonId");
            if (p.dueAt === null) update.dueAt = null;
            if (typeof p.dueAt === "string") {
              const d = new Date(p.dueAt);
              if (Number.isNaN(d.getTime())) throw new Error("dueAt must be an ISO date string");
              update.dueAt = d;
            }
          }

          const [row] = await db
            .update(tasks)
            .set(update)
            .where(and(eq(tasks.id, idParsed), eq(tasks.companyId, companyIdParsed)))
            .returning({
              id: tasks.id,
              title: tasks.title,
              status: tasks.status,
              priority: tasks.priority,
              dueAt: tasks.dueAt,
              ownerPersonId: tasks.ownerPersonId,
              updatedAt: tasks.updatedAt,
            });

          return { ok: true, task: row };
        },
      },
      {
        name: "createTask",
        description:
          "Create a new task in the current company. Returns the created task.",
        parameters: [
          { name: "title", type: "string", required: true, description: "Task title." },
          {
            name: "descriptionMd",
            type: "string",
            required: false,
            description: "Optional markdown description.",
          },
          {
            name: "priority",
            type: "string",
            required: false,
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            description: "Optional priority (default MEDIUM).",
          },
          {
            name: "status",
            type: "string",
            required: false,
            enum: ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"],
            description: "Optional initial status (default TODO).",
          },
          {
            name: "dueAt",
            type: "string",
            required: false,
            description: "Optional due date (ISO string).",
          },
        ],
        handler: async ({ title, descriptionMd, priority, status, dueAt }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();

          const now = new Date();
          const dueDate = dueAt ? new Date(dueAt) : null;
          if (dueAt && Number.isNaN(dueDate?.getTime())) {
            throw new Error("dueAt must be an ISO date string");
          }

          const [row] = await db
            .insert(tasks)
            .values({
              companyId: companyIdParsed,
              title,
              descriptionMd: descriptionMd ?? "",
              priority: (priority as any) ?? "MEDIUM",
              status: (status as any) ?? "TODO",
              dueAt: dueDate,
              createdByPersonId: personIdParsed,
              createdAt: now,
              updatedAt: now,
            })
            .returning({
              id: tasks.id,
              title: tasks.title,
              status: tasks.status,
              priority: tasks.priority,
              dueAt: tasks.dueAt,
            });

          return { ok: true, task: row };
        },
      },
      {
        name: "listPeople",
        description: "List people in this company workspace (directory).",
        parameters: [
          {
            name: "query",
            type: "string",
            required: false,
            description: "Optional search query (matches name/email).",
          },
          {
            name: "limit",
            type: "number",
            required: false,
            description: "Max number of people to return (default 20).",
          },
        ],
        handler: async ({ query, limit }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();

          const where = and(
            eq(memberships.companyId, companyIdParsed),
            query
              ? or(ilike(people.fullName, `%${query}%`), ilike(people.email, `%${query}%`))
              : undefined,
          );

          const rows = await db
            .select({
              id: people.id,
              fullName: people.fullName,
              email: people.email,
              title: people.title,
            })
            .from(memberships)
            .innerJoin(people, eq(memberships.personId, people.id))
            .where(where)
            .orderBy(desc(people.createdAt))
            .limit(typeof limit === "number" && limit > 0 ? Math.min(limit, 50) : 20);

          return { ok: true, people: rows };
        },
      },
      {
        name: "listCalendarEvents",
        description: "List calendar events for the current company from the local cache.",
        parameters: [
          { name: "from", type: "string", required: false, description: "ISO datetime (default: now - 7d)" },
          { name: "to", type: "string", required: false, description: "ISO datetime (default: now + 30d)" },
          { name: "query", type: "string", required: false, description: "Optional title search." },
          { name: "limit", type: "number", required: false, description: "Max results (default 20, max 50)." },
        ],
        handler: async ({ from, to, query, limit }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();

          const now = new Date();
          const fromD = from ? new Date(from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const toD = to ? new Date(to) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
            throw new Error("from/to must be ISO datetime strings");
          }

          const where = and(
            eq(calendarEvents.companyId, companyIdParsed),
            gte(calendarEvents.startsAt, fromD),
            lt(calendarEvents.startsAt, toD),
            query ? ilike(calendarEvents.title, `%${query}%`) : undefined,
          );

          const rows = await db
            .select({
              id: calendarEvents.id,
              title: calendarEvents.title,
              startsAt: calendarEvents.startsAt,
              endsAt: calendarEvents.endsAt,
              status: calendarEvents.status,
              hangoutLink: calendarEvents.hangoutLink,
            })
            .from(calendarEvents)
            .where(where)
            .orderBy(calendarEvents.startsAt)
            .limit(typeof limit === "number" && limit > 0 ? Math.min(limit, 50) : 20);

          return {
            ok: true,
            events: rows.map((r) => ({
              ...r,
              startsAt: r.startsAt.toISOString(),
              endsAt: r.endsAt.toISOString(),
            })),
          };
        },
      },
      {
        name: "listMeetings",
        description: "List recent meetings for the current company.",
        parameters: [
          {
            name: "limit",
            type: "number",
            required: false,
            description: "Max number of meetings to return (default 10).",
          },
        ],
        handler: async ({ limit }) => {
          await assertMembership({ companyId: companyIdParsed, personId: personIdParsed });
          const { db } = getDb();
          const rows = await db
            .select({
              id: meetings.id,
              title: meetings.title,
              startsAt: meetings.startsAt,
              endsAt: meetings.endsAt,
              state: meetings.state,
            })
            .from(meetings)
            .where(eq(meetings.companyId, companyIdParsed))
            .orderBy(desc(meetings.startsAt))
            .limit(typeof limit === "number" && limit > 0 ? Math.min(limit, 50) : 10);

          return { ok: true, meetings: rows };
        },
      },
    ];
  },
});

function getHandler() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set (required for CopilotKit chat).");
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    serviceAdapter: new OpenAIAdapter({
      openai: new OpenAI({ apiKey }),
    }),
    endpoint: "/api/copilotkit",
    logLevel: (process.env.LOG_LEVEL as any) ?? "info",
  });

  return handleRequest;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    return await getHandler()(req);
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "CopilotKit error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    return await getHandler()(req);
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "CopilotKit error" }, { status: 500 });
  }
}


