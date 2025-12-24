import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { agentRuns, approvals, calendarEvents, tasks } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";

export const runtime = "nodejs";

const BodySchema = z.object({
  companyId: z.string().uuid(),
  kind: z.enum(["MEETING_PREP", "MEETING_POST", "DAILY_BRIEF"]),
  payload: z.record(z.unknown()).optional().default({}),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.companyId !== session.companyId) {
    return NextResponse.json({ ok: false, error: "Wrong company" }, { status: 403 });
  }

  const { db } = getDb();
  const now = new Date();
  const threadId = randomUUID();

  const [run] = await db
    .insert(agentRuns)
    .values({
      companyId: parsed.data.companyId,
      kind: parsed.data.kind,
      status: "RUNNING",
      threadId,
      inputRefsJson: parsed.data.payload,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (parsed.data.kind !== "DAILY_BRIEF") {
    const output = {
      text: `Kind ${parsed.data.kind} not wired yet. (Coming in later phases)`,
    };
    await db
      .update(agentRuns)
      .set({ status: "COMPLETED", outputJson: output, updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    return NextResponse.json({ ok: true, runId: run.id, output });
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [{ meetingsCountRaw }] = await db
    .select({ meetingsCountRaw: sql`count(*)` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.companyId, parsed.data.companyId),
        gte(calendarEvents.startsAt, startOfToday),
        lt(calendarEvents.startsAt, endOfToday),
      ),
    );
  const meetingsCount = Number(meetingsCountRaw ?? 0);

  const overdueTasks = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.companyId, parsed.data.companyId),
        ne(tasks.status, "DONE"),
        lt(tasks.dueAt, now),
      ),
    )
    .limit(5);

  const pendingApprovalsCountRows = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.companyId, parsed.data.companyId), eq(approvals.status, "PENDING")));

  const lines: string[] = [];
  lines.push(`Daily Brief (${now.toLocaleString()})`);
  lines.push("");
  lines.push(`- Today’s meetings: ${meetingsCount}`);
  lines.push(`- Pending approvals: ${pendingApprovalsCountRows.length}`);
  lines.push(`- Overdue tasks: ${overdueTasks.length}${overdueTasks.length === 5 ? "+" : ""}`);
  if (overdueTasks.length) {
    lines.push("");
    lines.push("Top overdue:");
    for (const t of overdueTasks) lines.push(`- ${t.title}`);
  }

  const output = { text: lines.join("\n") };

  await db
    .update(agentRuns)
    .set({ status: "COMPLETED", outputJson: output, updatedAt: new Date() })
    .where(eq(agentRuns.id, run.id));

  return NextResponse.json({ ok: true, runId: run.id, output });
}


