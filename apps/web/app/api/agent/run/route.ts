import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, gte, ilike, lt, ne, or, sql } from "drizzle-orm";
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

  if (parsed.data.kind === "MEETING_PREP") {
    const PayloadSchema = z.object({ calendarEventId: z.string().uuid() });
    const p = PayloadSchema.safeParse(parsed.data.payload);
    if (!p.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const [event] = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, p.data.calendarEventId), eq(calendarEvents.companyId, parsed.data.companyId)))
      .limit(1);

    if (!event) {
      return NextResponse.json({ ok: false, error: "Calendar event not found" }, { status: 404 });
    }

    const kw = event.title.split(/\s+/).slice(0, 4).join(" ").trim();
    const related = kw
      ? await db
          .select({ id: tasks.id, title: tasks.title, status: tasks.status })
          .from(tasks)
          .where(
            and(
              eq(tasks.companyId, parsed.data.companyId),
              or(ilike(tasks.title, `%${kw}%`), ilike(tasks.descriptionMd, `%${kw}%`))!,
            ),
          )
          .limit(8)
      : [];

    const output = {
      prep_pack: {
        agenda: [`Review objectives for: ${event.title}`, "Key updates", "Decisions needed", "Next actions"],
        outcomes: ["Aligned priorities", "Clear owners for actions", "Next meeting date (if needed)"],
        risks: ["Unclear ownership", "Missing context in pre-reads"],
        related_tasks: related.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      },
    };

    await db
      .update(agentRuns)
      .set({ status: "COMPLETED", outputJson: output, updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));

    return NextResponse.json({ ok: true, runId: run.id, output });
  }

  if (parsed.data.kind === "MEETING_POST") {
    const output = { error: "MEETING_POST not wired yet" };
    await db
      .update(agentRuns)
      .set({ status: "FAILED", outputJson: output, updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    return NextResponse.json({ ok: false, error: "MEETING_POST not wired yet" }, { status: 501 });
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


