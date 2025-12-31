ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS 'GUEST';
ALTER TYPE "public"."agent_run_kind" ADD VALUE IF NOT EXISTS 'COPILOT_ACTION';

CREATE TYPE "public"."audit_actor" AS ENUM('HUMAN', 'AGENT', 'SYSTEM');
CREATE TYPE "public"."audit_action" AS ENUM(
  'TASK_CREATE',
  'TASK_UPDATE',
  'TASK_DELETE',
  'MEETING_FINALIZE',
  'APPROVAL_CREATE',
  'APPROVAL_DECIDE',
  'CALENDAR_EVENT_CREATE',
  'CALENDAR_EVENT_UPDATE',
  'CALENDAR_EVENT_CANCEL'
);
CREATE TYPE "public"."notification_type" AS ENUM(
  'MEETING_REMINDER',
  'APPROVAL_PENDING',
  'TASK_OVERDUE',
  'DAILY_BRIEF'
);

ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_idempotency_key_uq" ON "approvals" USING btree ("idempotency_key");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "actor_type" "audit_actor" NOT NULL,
  "actor_person_id" uuid REFERENCES "people"("id") ON DELETE set null,
  "action" "audit_action" NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_logs_company_idx" ON "audit_logs" USING btree ("company_id");
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE cascade,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notifications_company_idx" ON "notifications" USING btree ("company_id");
CREATE INDEX IF NOT EXISTS "notifications_person_idx" ON "notifications" USING btree ("person_id","read_at");
