import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { getDb } from "./index.js";
import {
  companies,
  memberships,
  people,
  projects,
  tasks,
} from "./schema.js";

export async function seedDb() {
  const { db } = getDb();

  const now = new Date();

  const [hwah] = await db
    .insert(companies)
    .values({
      name: "HWAH",
      slug: "hwah",
      timezone: "America/Los_Angeles",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: companies.slug,
      set: { name: "HWAH", timezone: "America/Los_Angeles" },
    })
    .returning();
  if (!hwah) throw new Error("Failed to upsert company: hwah");

  const [gasable] = await db
    .insert(companies)
    .values({
      name: "Gasable",
      slug: "gasable",
      timezone: "America/Los_Angeles",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: companies.slug,
      set: { name: "Gasable", timezone: "America/Los_Angeles" },
    })
    .returning();
  if (!gasable) throw new Error("Failed to upsert company: gasable");

  const ownerEmail = "owner@pa-os.local";
  const [owner] = await db
    .insert(people)
    .values({
      fullName: "Owner",
      email: ownerEmail,
      title: "Founder",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: people.email,
      set: { fullName: "Owner", title: "Founder" },
    })
    .returning();
  if (!owner) throw new Error("Failed to upsert owner user");

  const samplePeople = [
    { fullName: "Ava Chen", email: "ava@pa-os.local", title: "Ops" },
    { fullName: "Ben Rivera", email: "ben@pa-os.local", title: "Engineer" },
    { fullName: "Mina Park", email: "mina@pa-os.local", title: "PM" },
    { fullName: "Sam Patel", email: "sam@pa-os.local", title: "Design" },
    { fullName: "Noah Kim", email: "noah@pa-os.local", title: "Sales" },
  ];

  for (const p of samplePeople) {
    await db
      .insert(people)
      .values({ ...p, createdAt: now })
      .onConflictDoUpdate({
        target: people.email,
        set: { fullName: p.fullName, title: p.title },
      });
  }

  const membershipPairs: Array<{ companyId: string; personId: string; role: "OWNER" | "MEMBER" }> =
    [
      { companyId: hwah.id, personId: owner.id, role: "OWNER" },
      { companyId: gasable.id, personId: owner.id, role: "OWNER" },
    ];

  for (const m of membershipPairs) {
    await db
      .insert(memberships)
      .values({ ...m, createdAt: now })
      .onConflictDoNothing({
        target: [memberships.companyId, memberships.personId],
      });
  }

  const projectsByCompany: Array<{ companyId: string; name: string }> = [
    { companyId: hwah.id, name: "CEO OS Launch" },
    { companyId: hwah.id, name: "Hiring Sprint" },
    { companyId: gasable.id, name: "Growth Experiments" },
  ];

  // Create projects if missing (no unique constraint on name, so we query first)
  const createdProjects: Array<{ id: string; companyId: string; name: string }> = [];
  for (const p of projectsByCompany) {
    const existing = await db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      .where(and(eq(projects.companyId, p.companyId), eq(projects.name, p.name)))
      .limit(1);

    if (existing[0]) {
      createdProjects.push(existing[0]);
      continue;
    }

    const [inserted] = await db
      .insert(projects)
      .values({ ...p, status: "ACTIVE", createdAt: now })
      .returning({ id: projects.id, companyId: projects.companyId, name: projects.name });
    if (!inserted) throw new Error(`Failed to insert project: ${p.name}`);
    createdProjects.push(inserted);
  }

  // Only add sample tasks if the company has no tasks yet
  for (const company of [hwah, gasable] as const) {
    const existingTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.companyId, company.id))
      .limit(1);
    if (existingTasks.length) continue;

    const projectForCompany =
      createdProjects.find((p) => p.companyId === company.id) ?? createdProjects[0]!;

    const sampleTasks = [
      { title: "Draft weekly priorities", status: "TODO", priority: "HIGH" },
      { title: "Schedule 1:1s with team", status: "IN_PROGRESS", priority: "MEDIUM" },
      { title: "Review budget", status: "TODO", priority: "MEDIUM" },
      { title: "Prep investor update", status: "TODO", priority: "HIGH" },
      { title: "Fix onboarding doc gaps", status: "TODO", priority: "LOW" },
      { title: "Plan Q1 roadmap", status: "IN_PROGRESS", priority: "HIGH" },
      { title: "Follow up on partnership", status: "TODO", priority: "MEDIUM" },
      { title: "Close overdue support ticket", status: "BLOCKED", priority: "URGENT" },
      { title: "Publish hiring scorecard", status: "TODO", priority: "MEDIUM" },
      { title: "Clean up task taxonomy", status: "DONE", priority: "LOW" },
    ] as const;

    for (const [i, t] of sampleTasks.entries()) {
      const dueAt =
        t.status !== "DONE" && i % 3 === 0 ? new Date(Date.now() + 86400000 * (i - 2)) : null;

      await db.insert(tasks).values({
        companyId: company.id,
        projectId: projectForCompany.id,
        title: t.title,
        descriptionMd: `Seeded task: **${t.title}**`,
        status: t.status,
        priority: t.priority,
        ownerPersonId: owner.id,
        dueAt: dueAt ?? undefined,
        source: "SEED",
        createdByPersonId: owner.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    companies: { hwahId: hwah.id, gasableId: gasable.id },
    ownerPersonId: owner.id,
  };
}

async function main() {
  const { client } = getDb();
  const result = await seedDb();
  // eslint-disable-next-line no-console
  console.log("Seed complete:", result);
  await client.end();
}

const isDirectRun =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}


