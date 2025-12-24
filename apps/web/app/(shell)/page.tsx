import { getSession } from "@/lib/auth/get-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pa-os/ui";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Company-scoped overview (companyId: <span className="font-mono">{session?.companyId}</span>)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Today’s Meetings</CardTitle>
            <CardDescription>From cached calendar events</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Coming next.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue Tasks</CardTitle>
            <CardDescription>Needs attention</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Coming next.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending Approvals</CardTitle>
            <CardDescription>Awaiting your decision</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Coming next.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Generate Daily Brief</CardTitle>
            <CardDescription>Agent-powered summary</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Coming next.</CardContent>
        </Card>
      </div>
    </div>
  );
}


