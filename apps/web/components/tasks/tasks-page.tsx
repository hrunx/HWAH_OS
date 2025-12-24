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
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@pa-os/ui";

type Task = {
  id: string;
  companyId: string;
  title: string;
  descriptionMd: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  ownerPersonId: string | null;
  ownerName: string | null;
  dueAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type Person = {
  id: string;
  fullName: string;
  email: string;
  title: string | null;
  role: "OWNER" | "MEMBER";
};

const STATUSES: Task["status"][] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
const PRIORITIES: Task["priority"][] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function formatDue(dueAt: Task["dueAt"]) {
  if (!dueAt) return "—";
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return d.toLocaleString();
}

export function TasksPageClient({ companyId }: { companyId: string }) {
  const [view, setView] = React.useState<"list" | "kanban">("list");
  const [loading, setLoading] = React.useState(true);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [people, setPeople] = React.useState<Person[]>([]);

  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");
  const [ownerFilter, setOwnerFilter] = React.useState<string>("all");
  const [dueFilter, setDueFilter] = React.useState<string>("all");
  const [q, setQ] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);

  const [draft, setDraft] = React.useState({
    title: "",
    descriptionMd: "",
    status: "TODO" as Task["status"],
    priority: "MEDIUM" as Task["priority"],
    ownerPersonId: "" as string,
    dueAtLocal: "" as string,
  });

  async function loadPeople() {
    const res = await fetch(`/api/people/list?companyId=${companyId}`);
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load people");
    setPeople(json.people as Person[]);
  }

  async function loadTasks() {
    setLoading(true);
    try {
      const url = new URL(window.location.origin + "/api/tasks/list");
      url.searchParams.set("companyId", companyId);
      if (statusFilter !== "all") url.searchParams.set("status", statusFilter);
      if (priorityFilter !== "all") url.searchParams.set("priority", priorityFilter);
      if (ownerFilter !== "all") url.searchParams.set("owner", ownerFilter);
      if (dueFilter !== "all") url.searchParams.set("due", dueFilter);
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await fetch(url.toString());
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load tasks");
      setTasks(json.tasks as Task[]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadPeople(), loadTasks()]);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  React.useEffect(() => {
    loadTasks().catch((e: any) => toast.error(e?.message ?? "Failed to load tasks"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter, ownerFilter, dueFilter]);

  function openNew() {
    setEditing(null);
    setDraft({
      title: "",
      descriptionMd: "",
      status: "TODO",
      priority: "MEDIUM",
      ownerPersonId: "",
      dueAtLocal: "",
    });
    setEditorOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    const due = t.dueAt ? new Date(t.dueAt as any) : null;
    const dueAtLocal = due
      ? new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : "";
    setDraft({
      title: t.title,
      descriptionMd: t.descriptionMd ?? "",
      status: t.status,
      priority: t.priority,
      ownerPersonId: t.ownerPersonId ?? "",
      dueAtLocal,
    });
    setEditorOpen(true);
  }

  async function save() {
    try {
      if (!draft.title.trim()) {
        toast.error("Title is required");
        return;
      }

      if (!editing) {
        const res = await fetch("/api/tasks/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            title: draft.title.trim(),
            descriptionMd: draft.descriptionMd ?? "",
            status: draft.status,
            priority: draft.priority,
            ownerPersonId: draft.ownerPersonId || null,
            dueAt: draft.dueAtLocal ? new Date(draft.dueAtLocal).toISOString() : null,
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Create failed");
        toast.success("Task created");
      } else {
        const res = await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            taskId: editing.id,
            patch: {
              title: draft.title.trim(),
              descriptionMd: draft.descriptionMd ?? "",
              status: draft.status,
              priority: draft.priority,
              ownerPersonId: draft.ownerPersonId || null,
              dueAt: draft.dueAtLocal ? new Date(draft.dueAtLocal).toISOString() : null,
            },
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Update failed");
        toast.success("Task updated");
      }

      setEditorOpen(false);
      await loadTasks();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  }

  async function quickUpdate(taskId: string, patch: any) {
    try {
      const res = await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId, patch }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Update failed");
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...(json.task as any) } : t)));
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  const grouped = React.useMemo(() => {
    const g: Record<Task["status"], Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      DONE: [],
    };
    for (const t of tasks) g[t.status].push(t);
    return g;
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">List + kanban with assignments, due dates, priority.</p>
        </div>
        <Button onClick={openNew}>New Task</Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks…"
            className="w-[240px]"
          />
          <Button variant="secondary" onClick={() => loadTasks().catch(() => {})}>
            Search
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any owner</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dueFilter} onValueChange={setDueFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Due" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This week</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : tasks.length ? (
                <div className="divide-y">
                  {tasks.map((t) => (
                    <div key={t.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          className="text-left font-medium hover:underline truncate"
                          onClick={() => openEdit(t)}
                        >
                          {t.title}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{t.status}</Badge>
                          <Badge variant="outline">{t.priority}</Badge>
                          <span>Owner: {t.ownerName ?? "—"}</span>
                          <span>Due: {formatDue(t.dueAt)}</span>
                        </div>
                      </div>
                      <Select
                        value={t.status}
                        onValueChange={(v) => quickUpdate(t.id, { status: v })}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No tasks yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {STATUSES.map((status) => (
                <Card key={status} className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base">{status}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {grouped[status].length ? (
                      grouped[status].map((t) => (
                        <div key={t.id} className="rounded-lg border p-3 bg-card">
                          <button
                            className="text-left font-medium hover:underline"
                            onClick={() => openEdit(t)}
                          >
                            {t.title}
                          </button>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{t.priority}</Badge>
                            <span className="truncate">Owner: {t.ownerName ?? "—"}</span>
                          </div>
                          <div className="mt-2">
                            <Select
                              value={t.status}
                              onValueChange={(v) => quickUpdate(t.id, { status: v })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">No tasks.</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>All changes are scoped to this company.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Description (Markdown)</label>
              <Textarea
                value={draft.descriptionMd}
                onChange={(e) => setDraft((d) => ({ ...d, descriptionMd: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft((d) => ({ ...d, status: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={draft.priority}
                  onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Owner</label>
                <Select
                  value={draft.ownerPersonId || "none"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, ownerPersonId: v === "none" ? "" : v }))}
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
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">Due</label>
                <Input
                  type="datetime-local"
                  value={draft.dueAtLocal}
                  onChange={(e) => setDraft((d) => ({ ...d, dueAtLocal: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


