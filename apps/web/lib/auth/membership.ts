import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { memberships } from "@pa-os/db/schema";

export async function isCompanyMember(input: { personId: string; companyId: string }) {
  const { db } = getDb();
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.personId, input.personId), eq(memberships.companyId, input.companyId)),
  });
  return Boolean(row);
}

const roleOrder = ["GUEST", "MEMBER", "ADMIN", "OWNER"] as const;
type Role = (typeof roleOrder)[number];

export async function hasCompanyRole(input: {
  personId: string;
  companyId: string;
  minRole: Role;
}) {
  const { db } = getDb();
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.personId, input.personId), eq(memberships.companyId, input.companyId)),
  });
  if (!row) return false;
  const currentIndex = roleOrder.indexOf(row.role as Role);
  const requiredIndex = roleOrder.indexOf(input.minRole);
  return currentIndex >= requiredIndex;
}

