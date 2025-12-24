import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", ["OWNER", "MEMBER"]);
export const projectStatusEnum = pgEnum("project_status", ["ACTIVE", "ARCHIVED"]);
export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
]);
export const taskPriorityEnum = pgEnum("task_priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
export const meetingStateEnum = pgEnum("meeting_state", [
  "SCHEDULED",
  "LIVE",
  "PROCESSING",
  "READY",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "QUEUED",
  "RUNNING",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
]);
export const agentRunKindEnum = pgEnum("agent_run_kind", [
  "MEETING_PREP",
  "MEETING_POST",
  "DAILY_BRIEF",
]);
export const approvalTypeEnum = pgEnum("approval_type", ["CREATE_TASKS", "UPDATE_TASKS"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_slug_uq").on(t.slug)],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("people_email_uq").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_company_person_uq").on(t.companyId, t.personId),
    index("memberships_company_idx").on(t.companyId),
    index("memberships_person_idx").on(t.personId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: projectStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_company_idx").on(t.companyId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("TODO"),
    priority: taskPriorityEnum("priority").notNull().default("MEDIUM"),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    source: text("source").notNull().default("MANUAL"),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_company_status_idx").on(t.companyId, t.status),
    index("tasks_owner_idx").on(t.ownerPersonId),
    index("tasks_company_due_idx").on(t.companyId, t.dueAt),
  ],
);

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    targetTaskId: uuid("target_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [index("task_links_task_idx").on(t.taskId)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accountEmail: text("account_email").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    scopes: jsonb("scopes").notNull().default([]),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("integrations_company_provider_email_uq").on(
      t.companyId,
      t.provider,
      t.accountEmail,
    ),
    index("integrations_company_idx").on(t.companyId),
  ],
);

export const calendarChannels = pgTable(
  "calendar_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    googleChannelId: text("google_channel_id").notNull(),
    googleResourceId: text("google_resource_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    expirationAt: timestamp("expiration_at", { withTimezone: true }).notNull(),
    syncToken: text("sync_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("calendar_channels_integration_calendar_uq").on(
      t.integrationId,
      t.calendarId,
    ),
    index("calendar_channels_integration_idx").on(t.integrationId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    googleEventId: text("google_event_id").notNull(),
    etag: text("etag").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    attendeesJson: jsonb("attendees_json").notNull().default([]),
    hangoutLink: text("hangout_link"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("calendar_events_uq").on(t.integrationId, t.calendarId, t.googleEventId),
    index("calendar_events_company_starts_idx").on(t.companyId, t.startsAt),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    state: meetingStateEnum("state").notNull().default("SCHEDULED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meetings_company_idx").on(t.companyId),
    index("meetings_state_idx").on(t.state),
  ],
);

export const meetingAssets = pgTable(
  "meeting_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    storageUrl: text("storage_url").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meeting_assets_meeting_idx").on(t.meetingId)],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    language: text("language"),
    fullText: text("full_text").notNull(),
    segmentsJson: jsonb("segments_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transcripts_meeting_idx").on(t.meetingId)],
);

export const meetingOutputs = pgTable(
  "meeting_outputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    minutesMd: text("minutes_md").notNull().default(""),
    decisionsJson: jsonb("decisions_json").notNull().default([]),
    actionItemsJson: jsonb("action_items_json").notNull().default([]),
    risksJson: jsonb("risks_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meeting_outputs_meeting_uq").on(t.meetingId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: agentRunKindEnum("kind").notNull(),
    status: agentRunStatusEnum("status").notNull().default("QUEUED"),
    threadId: text("thread_id").notNull(),
    inputRefsJson: jsonb("input_refs_json").notNull().default({}),
    outputJson: jsonb("output_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_runs_company_idx").on(t.companyId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    type: approvalTypeEnum("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    status: approvalStatusEnum("status").notNull().default("PENDING"),
    reviewerPersonId: uuid("reviewer_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    reviewerFeedback: text("reviewer_feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("approvals_company_status_idx").on(t.companyId, t.status),
    index("approvals_agent_run_idx").on(t.agentRunId),
  ],
);

export const lgCheckpoints = pgTable(
  "lg_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: text("thread_id").notNull(),
    checkpointJson: jsonb("checkpoint_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lg_checkpoints_thread_idx").on(t.threadId)],
);

// Relations (optional but useful for joins/typing)
export const companiesRelations = relations(companies, ({ many }) => ({
  memberships: many(memberships),
  projects: many(projects),
  tasks: many(tasks),
  integrations: many(integrations),
  calendarEvents: many(calendarEvents),
  meetings: many(meetings),
  agentRuns: many(agentRuns),
  approvals: many(approvals),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  memberships: many(memberships),
  ownedTasks: many(tasks, { relationName: "task_owner" }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  company: one(companies, { fields: [memberships.companyId], references: [companies.id] }),
  person: one(people, { fields: [memberships.personId], references: [people.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  company: one(companies, { fields: [tasks.companyId], references: [companies.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  owner: one(people, {
    fields: [tasks.ownerPersonId],
    references: [people.id],
    relationName: "task_owner",
  }),
  createdBy: one(people, { fields: [tasks.createdByPersonId], references: [people.id] }),
  links: many(taskLinks),
}));

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  company: one(companies, { fields: [integrations.companyId], references: [companies.id] }),
  channels: many(calendarChannels),
  calendarEvents: many(calendarEvents),
}));

export const calendarChannelsRelations = relations(calendarChannels, ({ one }) => ({
  integration: one(integrations, {
    fields: [calendarChannels.integrationId],
    references: [integrations.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  company: one(companies, {
    fields: [calendarEvents.companyId],
    references: [companies.id],
  }),
  integration: one(integrations, {
    fields: [calendarEvents.integrationId],
    references: [integrations.id],
  }),
  meetings: many(meetings),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  company: one(companies, { fields: [meetings.companyId], references: [companies.id] }),
  calendarEvent: one(calendarEvents, {
    fields: [meetings.calendarEventId],
    references: [calendarEvents.id],
  }),
  transcripts: many(transcripts),
  assets: many(meetingAssets),
  outputs: many(meetingOutputs),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  meeting: one(meetings, { fields: [transcripts.meetingId], references: [meetings.id] }),
}));

export const meetingOutputsRelations = relations(meetingOutputs, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingOutputs.meetingId], references: [meetings.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  company: one(companies, { fields: [agentRuns.companyId], references: [companies.id] }),
  approvals: many(approvals),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  company: one(companies, { fields: [approvals.companyId], references: [companies.id] }),
  agentRun: one(agentRuns, { fields: [approvals.agentRunId], references: [agentRuns.id] }),
  reviewer: one(people, { fields: [approvals.reviewerPersonId], references: [people.id] }),
}));


