"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pa-os/ui";

type AuditLog = {
  id: string;
  companyId: string;
  companyName: string | null;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorPersonId: string | null;
  actorName: string | null;
  action:
    | "TASK_CREATE"
    | "TASK_UPDATE"
    | "TASK_DELETE"
    | "MEETING_FINALIZE"
    | "APPROVAL_CREATE"
    | "APPROVAL_DECIDE"
    | "CALENDAR_EVENT_CREATE"
    | "CALENDAR_EVENT_UPDATE"
    | "CALENDAR_EVENT_CANCEL";
  targetType: string;
  targetId: string | null;
  metadataJson: unknown;
  createdAt: string;
};

const ACTIONS: AuditLog["action"][] = [
  "TASK_CREATE",
  "TASK_UPDATE",
  "TASK_DELETE",
  "MEETING_FINALIZE",
  "APPROVAL_CREATE",
  "APPROVAL_DECIDE",
  "CALENDAR_EVENT_CREATE",
  "CALENDAR_EVENT_UPDATE",
  "CALENDAR_EVENT_CANCEL",
];

const ACTORS: AuditLog["actorType"][] = ["HUMAN", "AGENT", "SYSTEM"];

export function AuditPageClient({ companyId }: { companyId: string }) {
  const isAll = companyId === "all";
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actorType, setActorType] = React.useState<string>("all");
  const [action, setAction] = React.useState<string>("all");

  async function load() {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + "/api/audit/list");
      url.searchParams.set("companyId", companyId);
      if (actorType !== "all") url.searchParams.set("actorType", actorType);
      if (action !== "all") url.searchParams.set("action", action);
      const res = await fetch(url.toString());
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load audit logs");
      setLogs(json.logs as AuditLog[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, actorType, action]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Trace all human and agent actions across your workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={actorType} onValueChange={setActorType}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              {ACTORS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => load().catch(() => {})} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : logs.length ? (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{log.action}</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()} • {log.actorType}
                    {log.actorName ? ` • ${log.actorName}` : ""}
                    {isAll && log.companyName ? ` • ${log.companyName}` : ""}
                  </div>
                </div>
                <Badge variant={log.actorType === "HUMAN" ? "default" : "secondary"}>{log.actorType}</Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Target: {log.targetType}
                  {log.targetId ? ` • ${log.targetId}` : ""}
                </div>
                {log.metadataJson ? (
                  <pre className="rounded-md bg-muted p-2 text-xs overflow-auto">
                    {JSON.stringify(log.metadataJson, null, 2)}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No audit activity yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            When actions occur (tasks, approvals, meetings), you’ll see a record here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
