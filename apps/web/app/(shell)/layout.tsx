import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { companies, memberships } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { ShellLayout } from "@/components/shell/shell-layout";

export const runtime = "nodejs";

export default async function ShellGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { db } = getDb();
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
    })
    .from(memberships)
    .innerJoin(companies, eq(memberships.companyId, companies.id))
    .where(and(eq(memberships.personId, session.personId)));

  if (!rows.length) {
    redirect("/login");
  }

  const activeCompanyId =
    rows.find((c) => c.id === session.companyId)?.id ?? rows[0]!.id;

  return (
    <ShellLayout companies={rows} activeCompanyId={activeCompanyId}>
      {children}
    </ShellLayout>
  );
}


