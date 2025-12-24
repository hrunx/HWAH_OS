"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@pa-os/ui";

type Meeting = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  state: "SCHEDULED" | "LIVE" | "PROCESSING" | "READY";
};

type Bookmark = { t: number; kind: "Decision" | "Action" | "Important"; note?: string };
type Segment = { t: number; text: string };

function secondsSince(startedAtMs: number) {
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

export function MeetingRoom({ companyId, meeting }: { companyId: string; meeting: Meeting }) {
  const [listening, setListening] = React.useState(false);
  const [startedAtMs, setStartedAtMs] = React.useState<number | null>(null);

  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [segments, setSegments] = React.useState<Segment[]>([]);
  const [fullText, setFullText] = React.useState("");
  const [ending, setEnding] = React.useState(false);

  function addBookmark(kind: Bookmark["kind"]) {
    const t = startedAtMs ? secondsSince(startedAtMs) : 0;
    setBookmarks((prev) => prev.concat([{ t, kind }]));
    toast.success(`${kind} bookmark added`);
  }

  async function startListeningStub() {
    // Realtime WebRTC transcription is wired in Phase 3; for now we start a timer and accept manual text.
    if (!startedAtMs) setStartedAtMs(Date.now());
    setListening(true);
    toast.message("Listening started (stub). Paste transcript below or wire Realtime.");
  }

  async function endMeeting() {
    if (!fullText.trim()) {
      toast.error("Transcript is empty");
      return;
    }
    setEnding(true);
    try {
      const res = await fetch("/api/meetings/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId: meeting.id,
          transcript: {
            fullText,
            segments: segments.length ? segments : [{ t: 0, text: fullText }],
          },
          bookmarks,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Finalize failed");
      toast.success("Meeting finalized. Agent processing queued.");
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Finalize failed");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {new Date(meeting.startsAt).toLocaleString()} → {new Date(meeting.endsAt).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{meeting.state}</Badge>
          <Button variant="secondary" onClick={() => addBookmark("Decision")} disabled={!listening}>
            Decision
          </Button>
          <Button variant="secondary" onClick={() => addBookmark("Action")} disabled={!listening}>
            Action
          </Button>
          <Button variant="secondary" onClick={() => addBookmark("Important")} disabled={!listening}>
            Important
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Transcript</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button onClick={startListeningStub} disabled={listening}>
                {listening ? "Listening…" : "Start Listening"}
              </Button>
              <Button variant="destructive" onClick={endMeeting} disabled={ending || !fullText.trim()}>
                {ending ? "Finalizing…" : "End Meeting"}
              </Button>
            </div>

            <Textarea
              value={fullText}
              onChange={(e) => setFullText(e.target.value)}
              placeholder="(Phase 3) Realtime transcript will appear here. For now you can paste transcript text to test the pipeline."
              className="min-h-[260px]"
            />

            {bookmarks.length ? (
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs font-medium text-muted-foreground mb-2">Bookmarks</div>
                <ul className="space-y-1">
                  {bookmarks.map((b, idx) => (
                    <li key={idx} className="flex items-center justify-between">
                      <span>
                        <span className="font-mono mr-2">{b.t}s</span>
                        {b.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No bookmarks yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tiptap notes editor will be wired in the next step (Phase 3).
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


