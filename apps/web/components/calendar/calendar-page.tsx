"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
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
} from "@pa-os/ui";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  status: string;
  hangoutLink: string | null;
  companyId?: string;
  companyName?: string;
};

type TaskLite = { id: string; title: string; status: string; priority: string };

function keywordQuery(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .trim();
}

export function CalendarPageClient({
  companyId,
  events,
  googleConnected,
}: {
  companyId: string;
  events: CalendarEvent[];
  googleConnected: boolean;
}) {
  const isAll = companyId === "all";
  const router = useRouter();
  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [relatedTasks, setRelatedTasks] = React.useState<TaskLite[]>([]);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [prepPack, setPrepPack] = React.useState<string | null>(null);
  const [loadingPrep, setLoadingPrep] = React.useState(false);
  const [startingMeeting, setStartingMeeting] = React.useState(false);

  async function manualSync() {
    if (isAll) {
      toast.error("Calendar sync is company-specific. Pick a company first.");
      return;
    }
    try {
      const res = await fetch("/api/integrations/google/calendar/sync");
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Sync failed");
      toast.success("Sync enqueued. Refresh in a moment.");
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    }
  }

  async function loadRelatedTasks(ev: CalendarEvent) {
    setLoadingTasks(true);
    try {
      const q = keywordQuery(ev.title);
      const url = new URL(window.location.origin + "/api/tasks/list");
      url.searchParams.set("companyId", companyId);
      if (q) url.searchParams.set("q", q);
      const res = await fetch(url.toString());
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load tasks");
      setRelatedTasks((json.tasks as any[]).slice(0, 6));
    } finally {
      setLoadingTasks(false);
    }
  }

  async function generatePrepPack() {
    if (!selected) return;
    if (isAll) {
      toast.error("Prep packs are company-specific. Pick a company first.");
      return;
    }
    setLoadingPrep(true);
    setPrepPack(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          kind: "MEETING_PREP",
          payload: { calendarEventId: selected.id },
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Prep pack failed");
      setPrepPack(JSON.stringify((json.output as any)?.prep_pack ?? json.output, null, 2));
    } catch (e: any) {
      toast.error(e?.message ?? "Prep pack failed");
    } finally {
      setLoadingPrep(false);
    }
  }

  async function startMeeting() {
    if (!selected) return;
    if (isAll) {
      toast.error("Starting meetings is company-specific. Pick a company first.");
      return;
    }
    setStartingMeeting(true);
    try {
      const res = await fetch("/api/meetings/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, calendarEventId: selected.id }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to create meeting");
      router.push(`/meetings/${json.meetingId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create meeting");
    } finally {
      setStartingMeeting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">FullCalendar backed by cached Google events.</p>
        </div>
        <div className="flex items-center gap-2">
            {isAll ? (
              <Badge variant="secondary">All companies (read-only)</Badge>
            ) : googleConnected ? (
            <>
              <Badge variant="secondary">Google connected</Badge>
              <Button variant="secondary" onClick={manualSync}>
                Sync now
              </Button>
            </>
          ) : (
            <Button asChild>
              <a href="/api/integrations/google/oauth/start">Connect Google Calendar</a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            height="auto"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
            }))}
            eventClick={(arg) => {
              const ev = events.find((e) => e.id === arg.event.id);
              if (!ev) return;
              setSelected(ev);
              setDrawerOpen(true);
              setPrepPack(null);
              loadRelatedTasks(ev).catch((e: any) => toast.error(e?.message ?? "Failed to load tasks"));
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "Event"}</DialogTitle>
            <DialogDescription>
                {selected ? (
                  <>
                    {`${new Date(selected.start).toLocaleString()} → ${new Date(selected.end).toLocaleString()}`}
                    {selected.companyName ? ` • ${selected.companyName}` : ""}
                  </>
                ) : null}
            </DialogDescription>
          </DialogHeader>

          {selected?.hangoutLink ? (
            <div className="text-sm">
              <a className="underline" href={selected.hangoutLink} target="_blank" rel="noreferrer">
                Join link
              </a>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-sm font-medium">Related tasks</div>
            {loadingTasks ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : relatedTasks.length ? (
              <ul className="space-y-1 text-sm">
                {relatedTasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No related tasks found.</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Prep pack</div>
            {prepPack ? (
              <pre className="max-h-64 overflow-auto rounded-lg border bg-card p-3 text-xs">{prepPack}</pre>
            ) : (
              <div className="text-sm text-muted-foreground">
                Generate agenda/outcomes/risks based on event + related tasks.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Close
            </Button>
            <Button variant="secondary" onClick={startMeeting} disabled={startingMeeting}>
              {startingMeeting ? "Starting…" : "Start Meeting"}
            </Button>
            <Button onClick={generatePrepPack} disabled={loadingPrep}>
              {loadingPrep ? "Generating…" : "Generate Prep Pack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


