export const runtime = "nodejs";

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@pa-os/db";
import { meetings } from "@pa-os/db/schema";

import { getSession } from "@/lib/auth/get-session";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@pa-os/ui";

export default async function MeetingsPage() {
  const session = await getSession();
  if (!session) return null;

  const { db } = getDb();
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      state: meetings.state,
    })
    .from(meetings)
    .where(eq(meetings.companyId, session.companyId))
    .orderBy(desc(meetings.startsAt))
    .limit(50);

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, m) => {
    (acc[m.state] ??= []).push(m);
    return acc;
  }, {});

  const order = ["SCHEDULED", "LIVE", "PROCESSING", "READY"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">Start meetings from calendar events.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {order.map((state) => (
          <Card key={state}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{state}</span>
                <Badge variant="secondary">{(grouped[state] ?? []).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(grouped[state] ?? []).length ? (
                (grouped[state] ?? []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.startsAt).toLocaleString()} → {new Date(m.endsAt).toLocaleString()}
                      </div>
                    </div>
                    <Button asChild variant="secondary">
                      <Link href={`/meetings/${m.id}`}>Open</Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No meetings.</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


