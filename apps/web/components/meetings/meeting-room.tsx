"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@pa-os/ui";
import { NotesEditor } from "./notes-editor";

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
  const [partial, setPartial] = React.useState("");
  const [ending, setEnding] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const dcRef = React.useRef<RTCDataChannel | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const partialRef = React.useRef<string>("");

  React.useEffect(() => {
    return () => {
      // Best-effort cleanup on navigation
      stopListening().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addBookmark(kind: Bookmark["kind"]) {
    const t = startedAtMs ? secondsSince(startedAtMs) : 0;
    setBookmarks((prev) => prev.concat([{ t, kind }]));
    toast.success(`${kind} bookmark added`);
  }

  function appendPartial(delta: string) {
    partialRef.current += delta;
    setPartial(partialRef.current);
  }

  function commitSegment(text: string) {
    const t = startedAtMs ? secondsSince(startedAtMs) : 0;
    setSegments((prev) => prev.concat([{ t, text }]));
    setFullText((prev) => (prev ? `${prev}\n${text}` : text));
    partialRef.current = "";
    setPartial("");
  }

  function handleRealtimeEvent(evt: any) {
    const type = String(evt?.type ?? "");

    // Common delta streams
    const delta = typeof evt?.delta === "string" ? evt.delta : null;
    const transcript =
      typeof evt?.transcript === "string"
        ? evt.transcript
        : typeof evt?.text === "string"
          ? evt.text
          : null;

    if (delta && (type.endsWith(".delta") || type.includes("transcript"))) {
      appendPartial(delta);
      return;
    }

    // Common completion events
    if (type.includes("completed") || type.endsWith(".done") || type.endsWith(".completed")) {
      const text = transcript ?? partialRef.current;
      if (text && text.trim()) commitSegment(text.trim());
      return;
    }

    // Fallback: if it looks like a transcript payload, accept it
    if (transcript && (type.includes("transcript") || type.includes("transcription"))) {
      commitSegment(transcript.trim());
    }
  }

  async function stopListening() {
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setListening(false);
  }

  async function startListening() {
    if (listening || connecting) return;
    setConnecting(true);
    try {
      if (!startedAtMs) setStartedAtMs(Date.now());

      const secretRes = await fetch("/api/meetings/realtime/client-secret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      const secretJson = (await secretRes.json().catch(() => null)) as any;
      if (!secretRes.ok || !secretJson?.ok) {
        throw new Error(secretJson?.error ?? "Failed to create realtime session");
      }

      const realtimeModel = secretJson.realtimeModel as string;
      const transcriptionModel = secretJson.transcriptionModel as string;
      const cs = secretJson.clientSecret as any;
      const token =
        cs?.client_secret?.value ??
        cs?.client_secret ??
        cs?.value ??
        cs?.token ??
        cs?.ephemeral_key?.value ??
        cs?.ephemeral_key ??
        null;
      if (!token) throw new Error("Missing client secret token in response");

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          stopListening().catch(() => {});
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        try {
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                input_audio_transcription: { model: transcriptionModel },
                turn_detection: { type: "server_vad" },
                instructions: "You are a transcription engine. Transcribe the user's audio faithfully.",
              },
            }),
          );
        } catch {}
      };
      dc.onmessage = (e) => {
        try {
          handleRealtimeEvent(JSON.parse(String(e.data)));
        } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete so the SDP includes candidates.
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const onState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", onState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", onState);
      });

      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/sdp",
        },
        body: pc.localDescription?.sdp ?? offer.sdp,
      });

      const answerSdp = await sdpRes.text();
      if (!sdpRes.ok) {
        throw new Error(answerSdp || `Realtime SDP exchange failed (${sdpRes.status})`);
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setListening(true);
      toast.success("Realtime transcription started");
    } catch (e: any) {
      await stopListening();
      toast.error(e?.message ?? "Failed to start realtime");
    } finally {
      setConnecting(false);
    }
  }

  async function endMeeting() {
    const finalText = (partialRef.current ? `${fullText}\n${partialRef.current}` : fullText).trim();
    const finalSegments =
      segments.length > 0
        ? segments.concat(partialRef.current ? [{ t: startedAtMs ? secondsSince(startedAtMs) : 0, text: partialRef.current }] : [])
        : [{ t: 0, text: finalText }];

    if (!finalText) {
      toast.error("Transcript is empty");
      return;
    }
    setEnding(true);
    try {
      await stopListening();
      const res = await fetch("/api/meetings/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId: meeting.id,
          transcript: {
            fullText: finalText,
            segments: finalSegments,
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
              <Button onClick={startListening} disabled={listening || connecting}>
                {connecting ? "Connecting…" : listening ? "Listening…" : "Start Listening"}
              </Button>
              <Button variant="secondary" onClick={stopListening} disabled={!listening}>
                Stop
              </Button>
              <Button variant="destructive" onClick={endMeeting} disabled={ending || (!fullText.trim() && !partial.trim())}>
                {ending ? "Finalizing…" : "End Meeting"}
              </Button>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <div className="max-h-[300px] overflow-auto text-sm whitespace-pre-wrap">
                {segments.map((s, idx) => (
                  <div key={idx}>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{s.t}s</span>
                    {s.text}
                  </div>
                ))}
                {partial ? (
                  <div className="text-muted-foreground">
                    <span className="mr-2 font-mono text-xs">{startedAtMs ? secondsSince(startedAtMs) : 0}s</span>
                    {partial}
                  </div>
                ) : null}
              </div>
            </div>

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
          <CardContent>
            <NotesEditor meetingId={meeting.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


