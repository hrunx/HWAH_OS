"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Home, Inbox, Settings, Users, ShieldCheck, Mic } from "lucide-react";

import { Button, cn } from "@pa-os/ui";

import { CompanySwitcher, type CompanyOption } from "./company-switcher";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/meetings", label: "Meetings", icon: Mic },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/people", label: "People", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ShellLayout({
  companies,
  activeCompanyId,
  children,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:min-h-screen">
          <div className="p-4 border-b">
            <div className="text-sm font-semibold tracking-tight">PA OS</div>
            <div className="text-xs text-muted-foreground">Local-first CEO OS</div>
          </div>
          <nav className="flex-1 p-2">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t text-xs text-muted-foreground">
            Phase 1–4 vertical slice
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-40 bg-background/70 backdrop-blur border-b">
            <div className="flex items-center justify-between gap-3 p-3">
              <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} />
              <div className="flex items-center gap-2">
                <Button variant="outline">Ask PA</Button>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}


