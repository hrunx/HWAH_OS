"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@pa-os/ui";

type Meeting = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  state: string;
};

function parseSseChunk(buffer: string) {
  // Minimal SSE parser for @ag-ui/encoder format: each event is an SSE "data: <json>\n\n"
  const events: any[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const lines = part.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const payload = line.slice("data:".length).trim();
        if (!payload) continue;
        try {
          events.push(JSON.parse(payload));
        } catch {
          // ignore
        }
      }
    }
  }
  return { events, rest };
}

export function CoAgentsPageClient({ companyId }: { companyId: string }) {
  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [meetingId, setMeetingId] = React.useState<string>("");
  const [prompt, setPrompt] = React.useState<string>("Run post-meeting for this meetingId.");
  const [running, setRunning] = React.useState(false);
  const [events, setEvents] = React.useState<any[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/meetings");
        // We don't have a JSON endpoint for meetings list; fall back to a small server-side query endpoint later.
        // For now, fetch meetings via existing page HTML isn't reliable. We'll pull from /api via a new helper soon.
      } catch {}
    })();
  }, []);

  async function loadMeetings() {
    try {
      // Reuse /api/agent/run? No. We'll add a tiny query endpoint by using CopilotKit tool via /api/copilotkit is overkill.
      // Instead, hit the DB via a small existing server route: meetings list page is server component.
      const res = await fetch(`/api/internal/meetings?companyId=${companyId}`);
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load meetings");
      setMeetings(json.meetings as Meeting[]);
      if (!meetingId && json.meetings?.[0]?.id) setMeetingId(json.meetings[0].id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load meetings");
    }
  }

  React.useEffect(() => {
    loadMeetings().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function runPostMeeting() {
    if (!meetingId) {
      toast.error("Pick a meeting");
      return;
    }
    setRunning(true);
    setEvents([]);

    const threadId = `coagent-${meetingId}`;
    const runId = globalThis.crypto.randomUUID();
    const messageId = globalThis.crypto.randomUUID();

    try {
      const res = await fetch("/api/coagents/agent/postMeeting/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId,
          runId,
          state: {},
          messages: [
            {
              id: messageId,
              role: "user",
              content: `${prompt}\nmeetingId: ${meetingId}`,
            },
          ],
          tools: [],
          context: [{ description: "companyId", value: companyId }],
          forwardedProps: { meetingId },
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to start coagent (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buf);
        buf = parsed.rest;
        if (parsed.events.length) {
          setEvents((prev) => prev.concat(parsed.events));
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Coagent run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CoAgents</h1>
        <p className="text-sm text-muted-foreground">Streaming LangGraph-style agent runs (AG-UI events) locally.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Post-meeting agent (streaming)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Meeting</label>
            <Select value={meetingId || "none"} onValueChange={(v) => setMeetingId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a meeting" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select…</SelectItem>
                {meetings.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title} ({new Date(m.startsAt).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Prompt</label>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={runPostMeeting} disabled={running}>
              {running ? "Running…" : "Run post-meeting"}
            </Button>
            <Button variant="secondary" onClick={() => loadMeetings().catch(() => {})} disabled={running}>
              Refresh meetings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stream</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Tip: If you see <code>approval_required</code>, open <code>/approvals</code>.
          </div>
          <Textarea value={JSON.stringify(events, null, 2)} readOnly className="min-h-[360px] font-mono text-xs" />
        </CardContent>
      </Card>
    </div>
  );
}


