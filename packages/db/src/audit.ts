import type { DbClient } from "./index.js";
import { getDb } from "./index.js";
import { auditLogs } from "./schema.js";

export type AuditActorType = "HUMAN" | "AGENT" | "SYSTEM";
export type AuditActionType =
  | "TASK_CREATE"
  | "TASK_UPDATE"
  | "TASK_DELETE"
  | "MEETING_FINALIZE"
  | "APPROVAL_CREATE"
  | "APPROVAL_DECIDE"
  | "CALENDAR_EVENT_CREATE"
  | "CALENDAR_EVENT_UPDATE"
  | "CALENDAR_EVENT_CANCEL";

export async function recordAuditLog(input: {
  companyId: string;
  actorType: AuditActorType;
  actorPersonId?: string | null;
  action: AuditActionType;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  db?: DbClient["db"];
}) {
  const { db } = input.db ? { db: input.db } : getDb();
  await db.insert(auditLogs).values({
    companyId: input.companyId,
    actorType: input.actorType,
    actorPersonId: input.actorPersonId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadataJson: input.metadata ?? {},
    createdAt: new Date(),
  });
}
