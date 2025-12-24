"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pa-os/ui";

export function DailyBriefCard({ companyId }: { companyId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [brief, setBrief] = React.useState<string | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, kind: "DAILY_BRIEF", payload: {} }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to generate brief");
      setBrief(json.output?.text ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate brief");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>Generate Daily Brief</CardTitle>
        <CardDescription>Agent-powered summary</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate"}
        </Button>
        {brief ? (
          <div className="rounded-lg border bg-card p-3 text-sm whitespace-pre-wrap">{brief}</div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Produces a short brief from tasks, approvals, and today’s meetings.
          </div>
        )}
      </CardContent>
    </Card>
  );
}


