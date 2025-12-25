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


