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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@pa-os/ui";

type Approval = {
  id: string;
  companyId: string;
  companyName?: string | null;
  agentRunId: string;
  type: "CREATE_TASKS" | "UPDATE_TASKS";
  status: "PENDING" | "APPROVED" | "REJECTED";
  payloadJson: unknown;
  createdAt: string;
  decidedAt: string | null;
  reviewerFeedback: string | null;
};

type Person = {
  id: string;
  fullName: string;
};

type CreateTasksPayload = {
  tasks: Array<{
    title: string;
    descriptionMd?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueAt?: string;
    ownerPersonId?: string;
  }>;
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

function toLocalDatetimeInputValue(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ApprovalsPageClient({ companyId }: { companyId: string }) {
  const isAll = companyId === "all";
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<string>("PENDING");
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingApproval, setEditingApproval] = React.useState<Approval | null>(null);
  const [editedPayload, setEditedPayload] = React.useState<CreateTasksPayload>({ tasks: [] });
  const [feedback, setFeedback] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

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

  async function loadPeople() {
    try {
      const res = await fetch(`/api/people/list?companyId=${isAll ? "all" : companyId}`);
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) return;
      setPeople((json.people as any[]).map((p) => ({ id: p.id, fullName: p.fullName })));
    } catch {
      // ignore (optional for approvals editor)
    }
  }

  React.useEffect(() => {
    load().catch((e: any) => toast.error(e?.message ?? "Failed to load approvals"));
    loadPeople().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status]);

  function openEditor(a: Approval) {
    if (a.type !== "CREATE_TASKS") {
      toast.error("Only CREATE_TASKS approvals are editable right now.");
      return;
    }

    const incoming = (a.payloadJson as any) as CreateTasksPayload;
    const tasks = Array.isArray(incoming?.tasks) ? incoming.tasks : [];
    setEditingApproval(a);
    setEditedPayload({
      tasks: tasks.map((t) => ({
        title: String((t as any)?.title ?? ""),
        descriptionMd: (t as any)?.descriptionMd ? String((t as any).descriptionMd) : "",
        priority: (t as any)?.priority,
        dueAt: (t as any)?.dueAt,
        ownerPersonId: (t as any)?.ownerPersonId,
      })),
    });
    setFeedback("");
    setEditorOpen(true);
  }

  async function decide(approvalId: string, decision: "APPROVE" | "REJECT", opts?: { editedPayload?: CreateTasksPayload; feedback?: string }) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/agent/approvals/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvalId,
          decision,
          editedPayload: opts?.editedPayload,
          feedback: opts?.feedback,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Decision failed");
      toast.success(decision === "APPROVE" ? "Approved" : "Rejected");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Decision failed");
    } finally {
      setSubmitting(false);
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
                      {new Date(a.createdAt).toLocaleString()}
                      {isAll ? ` • ${a.companyName ?? a.companyId}` : ""}
                      {" • "}
                      <span className="font-mono">{a.id}</span>
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
                      {a.type === "CREATE_TASKS" ? (
                        <Button variant="secondary" onClick={() => openEditor(a)}>
                          Edit…
                        </Button>
                      ) : null}
                      <Button onClick={() => decide(a.id, "APPROVE")} disabled={submitting}>
                        Approve
                      </Button>
                      <Button variant="destructive" onClick={() => decide(a.id, "REJECT")} disabled={submitting}>
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit approval payload</DialogTitle>
            <DialogDescription>
              Review and adjust proposed tasks before approving. (Company-scoped.)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Tasks to create</div>
              <Button
                variant="secondary"
                onClick={() =>
                  setEditedPayload((p) => ({
                    tasks: p.tasks.concat([{ title: "", descriptionMd: "", priority: "MEDIUM" }]),
                  }))
                }
              >
                Add task
              </Button>
            </div>

            {editedPayload.tasks.length ? (
              <div className="space-y-3">
                {editedPayload.tasks.map((t, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-3">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Title</label>
                      <Input
                        value={t.title}
                        onChange={(e) =>
                          setEditedPayload((p) => ({
                            tasks: p.tasks.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={t.descriptionMd ?? ""}
                        onChange={(e) =>
                          setEditedPayload((p) => ({
                            tasks: p.tasks.map((x, i) => (i === idx ? { ...x, descriptionMd: e.target.value } : x)),
                          }))
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Priority</label>
                        <Select
                          value={t.priority ?? "MEDIUM"}
                          onValueChange={(v) =>
                            setEditedPayload((p) => ({
                              tasks: p.tasks.map((x, i) => (i === idx ? { ...x, priority: v as any } : x)),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Owner</label>
                        <Select
                          value={t.ownerPersonId ?? "none"}
                          onValueChange={(v) =>
                            setEditedPayload((p) => ({
                              tasks: p.tasks.map((x, i) =>
                                i === idx ? { ...x, ownerPersonId: v === "none" ? undefined : v } : x,
                              ),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {people.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Due</label>
                        <Input
                          type="datetime-local"
                          value={toLocalDatetimeInputValue(t.dueAt)}
                          onChange={(e) => {
                            const iso = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                            setEditedPayload((p) => ({
                              tasks: p.tasks.map((x, i) => (i === idx ? { ...x, dueAt: iso } : x)),
                            }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        onClick={() =>
                          setEditedPayload((p) => ({ tasks: p.tasks.filter((_, i) => i !== idx) }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No tasks in payload.</div>
            )}

            <div className="grid gap-2">
              <label className="text-sm font-medium">Reviewer feedback (optional)</label>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditorOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            {editingApproval ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => decide(editingApproval.id, "REJECT", { feedback })}
                  disabled={submitting}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => {
                    const trimmed = {
                      tasks: editedPayload.tasks
                        .map((t) => ({ ...t, title: t.title.trim() }))
                        .filter((t) => t.title.length > 0),
                    };
                    if (!trimmed.tasks.length) {
                      toast.error("Add at least one task title to approve.");
                      return;
                    }
                    decide(editingApproval.id, "APPROVE", { editedPayload: trimmed, feedback }).then(() =>
                      setEditorOpen(false),
                    );
                  }}
                  disabled={submitting}
                >
                  Approve changes
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


