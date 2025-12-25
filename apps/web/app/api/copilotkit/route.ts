import OpenAI from "openai";
import { copilotRuntimeNextJSAppRouterEndpoint, CopilotRuntime, OpenAIAdapter } from "@copilotkit/runtime";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetings, memberships, people, tasks } from "@pa-os/db/schema";

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


