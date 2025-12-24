"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pa-os/ui";

type Approval = {
  id: string;
  companyId: string;
  agentRunId: string;
  type: "CREATE_TASKS" | "UPDATE_TASKS";
  status: "PENDING" | "APPROVED" | "REJECTED";
  payloadJson: unknown;
  createdAt: string;
  decidedAt: string | null;
  reviewerFeedback: string | null;
};

function previewPayload(type: Approval["type"], payload: unknown) {
  try {
    if (type === "CREATE_TASKS") {
      const tasks = (payload as any)?.tasks;
      if (Array.isArray(tasks)) {
        return tasks.slice(0, 5).map((t: any) => String(t?.title ?? "Untitled"));
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function ApprovalsPageClient({ companyId }: { companyId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<string>("PENDING");
  const [approvals, setApprovals] = React.useState<Approval[]>([]);

  async function load() {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + "/api/approvals/list");
      url.searchParams.set("companyId", companyId);
      if (status !== "all") url.searchParams.set("status", status);
      const res = await fetch(url.toString());
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load approvals");
      setApprovals(json.approvals as Approval[]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch((e: any) => toast.error(e?.message ?? "Failed to load approvals"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status]);

  async function decide(approvalId: string, decision: "APPROVE" | "REJECT") {
    try {
      const res = await fetch("/api/agent/approvals/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Decision failed");
      toast.success(decision === "APPROVE" ? "Approved" : "Rejected");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Decision failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground">Review and apply agent-proposed changes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => load().catch(() => {})} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : approvals.length ? (
        <div className="grid gap-4">
          {approvals.map((a) => {
            const preview = previewPayload(a.type, a.payloadJson);
            return (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{a.type}</CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()} • <span className="font-mono">{a.id}</span>
                    </div>
                  </div>
                  <Badge variant={a.status === "PENDING" ? "secondary" : a.status === "APPROVED" ? "default" : "destructive"}>
                    {a.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {preview ? (
                    <div className="rounded-lg border bg-card p-3 text-sm">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Preview</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {preview.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No preview available. (Edit view comes with Phase 4.)
                    </div>
                  )}

                  {a.status === "PENDING" ? (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => decide(a.id, "APPROVE")}>Approve</Button>
                      <Button variant="destructive" onClick={() => decide(a.id, "REJECT")}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No approvals</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            When workflows need permission (e.g., creating tasks), you’ll see approval cards here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}


