"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronsUpDown } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pa-os/ui";

export type CompanyOption = {
  id: string;
  name: string;
  slug: string;
};

export function CompanySwitcher({
  companies,
  activeCompanyId,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
}) {
  const active = companies.find((c) => c.id === activeCompanyId) ?? companies[0];
  const [loading, setLoading] = React.useState(false);

  async function switchCompany(companyId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/switch-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || json.ok !== true) {
        toast.error(json && "error" in json ? json.error ?? "Failed to switch company" : "Failed to switch company");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="justify-between gap-2 min-w-[200px]" disabled={loading}>
          <span className="truncate">{active?.name ?? "Company"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => switchCompany(c.id)}>
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


