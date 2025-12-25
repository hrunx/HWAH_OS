import { cookies } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { memberships } from "@pa-os/db/schema";

import type { SessionPayload } from "./session";

export const VIEW_COMPANY_COOKIE_NAME = "paos_view_company";

const ViewCompanySchema = z.union([z.literal("all"), z.string().uuid()]);

export type ViewCompanyId = z.infer<typeof ViewCompanySchema>;

export async function getViewCompanyId(session: SessionPayload): Promise<ViewCompanyId> {
  const raw = (await cookies()).get(VIEW_COMPANY_COOKIE_NAME)?.value ?? null;
  const parsed = ViewCompanySchema.safeParse(raw);
  if (!parsed.success) return session.companyId;

  if (parsed.data === "all") return "all";

  // Validate membership (cookie could be stale)
  const { db } = getDb();
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.personId, session.personId), eq(memberships.companyId, parsed.data)))
    .limit(1);

  if (!m) return session.companyId;
  return parsed.data;
}


