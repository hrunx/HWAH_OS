"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";

import { Button } from "@pa-os/ui";

export function NotesEditor({ meetingId }: { meetingId: string }) {
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write meeting notes…" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[240px]",
      },
    },
  });

  React.useEffect(() => {
    async function load() {
      try {
        const url = new URL(window.location.origin + "/api/meetings/notes");
        url.searchParams.set("meetingId", meetingId);
        const res = await fetch(url.toString());
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load notes");
        if (json.contentJson && editor) editor.commands.setContent(json.contentJson);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    if (editor) load();
  }, [meetingId, editor]);

  async function save() {
    if (!editor) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meetings/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, contentJson: editor.getJSON() }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Save failed");
      toast.success("Notes saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Notes</div>
        <Button variant="secondary" onClick={save} disabled={!editor || saving || loading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="rounded-lg border bg-card p-3">
        {editor ? <EditorContent editor={editor} /> : <div className="text-sm text-muted-foreground">Loading…</div>}
      </div>
    </div>
  );
}


