"use client";

import { PostMeetingRunner } from "@/components/coagents/post-meeting-runner";

import { Card, CardContent, CardHeader, CardTitle } from "@pa-os/ui";

export function CoAgentsPageClient({ companyId }: { companyId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CoAgents</h1>
        <p className="text-sm text-muted-foreground">Streaming LangGraph-style agent runs (AG-UI events) locally.</p>
      </div>

      <PostMeetingRunner companyId={companyId} />

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This runs the post-meeting LangGraph workflow locally (durable checkpoints in Postgres) and streams AG-UI events.
          Approvals still flow through the Approval Center.
        </CardContent>
      </Card>
    </div>
  );
}


