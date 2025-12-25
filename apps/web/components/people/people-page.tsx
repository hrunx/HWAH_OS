"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pa-os/ui";

type Person = {
  id: string;
  fullName: string;
  email: string;
  title: string | null;
  role: "OWNER" | "MEMBER";
  companyName?: string | null;
};

export function PeoplePageClient({ companyId }: { companyId: string }) {
  const isAll = companyId === "all";
  const [loading, setLoading] = React.useState(true);
  const [people, setPeople] = React.useState<Person[]>([]);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [role, setRole] = React.useState<"OWNER" | "MEMBER">("MEMBER");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/people/list?companyId=${companyId}`);
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load people");
      setPeople(json.people as Person[]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch((e: any) => toast.error(e?.message ?? "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function createPerson() {
    if (isAll) {
      toast.error("Adding people is company-specific. Pick a company first.");
      return;
    }
    try {
      const res = await fetch("/api/people/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          fullName: fullName.trim(),
          email: email.trim(),
          title: title.trim() ? title.trim() : null,
          role,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Create failed");

      toast.success("Person added");
      setFullName("");
      setEmail("");
      setTitle("");
      setRole("MEMBER");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Create failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">Directory + memberships.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add person</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex items-center gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">MEMBER</SelectItem>
                <SelectItem value="OWNER">OWNER</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={createPerson} disabled={isAll || !fullName.trim() || !email.trim()}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : people.length ? (
            <div className="divide-y">
              {people.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.fullName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.email} {p.title ? `• ${p.title}` : ""} • {p.role}
                      {isAll && p.companyName ? ` • ${p.companyName}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No people yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


