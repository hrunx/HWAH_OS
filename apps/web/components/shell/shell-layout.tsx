"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Home, Inbox, Settings, Users, ShieldCheck, Mic, Workflow } from "lucide-react";

import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@pa-os/ui";

import { CompanySwitcher, type CompanyOption } from "./company-switcher";
import { ThemeToggle } from "./theme-toggle";
import { PostMeetingRunner } from "@/components/coagents/post-meeting-runner";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/meetings", label: "Meetings", icon: Mic },
  { href: "/coagents", label: "CoAgents", icon: Workflow },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/people", label: "People", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ShellLayout({
  companies,
  activeCompanyId,
  personId,
  children,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
  personId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [copilotOpen, setCopilotOpen] = React.useState(false);

  const copilotInstructions = `You are CEO OS (Local-first PA).

Your job is to help the user operate their company with high accuracy, using available tools when possible.

Rules:
- You are scoped to companyId: ${activeCompanyId}
- If you need to read or mutate data, use tools like listTasks/createTask/listMeetings instead of guessing.
- Keep answers concise and actionable.`;

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      credentials="include"
      properties={{ companyId: activeCompanyId, personId }}
      showDevConsole={false}
    >
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex">
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:sticky lg:top-0 lg:h-screen lg:shrink-0">
            <div className="p-4 border-b">
              <div className="text-sm font-semibold tracking-tight">PA OS</div>
              <div className="text-xs text-muted-foreground">Local-first CEO OS</div>
            </div>
            <nav className="flex-1 p-2 overflow-y-auto">
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
            <div className="p-3 border-t text-xs text-muted-foreground">Phase 1–4 vertical slice</div>
          </aside>

          <main className="flex-1 min-w-0">
            <header className="sticky top-0 z-40 bg-background/70 backdrop-blur border-b">
              <div className="flex items-center justify-between gap-3 p-3">
                <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setCopilotOpen(true)}>
                    Ask PA
                  </Button>
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <div className="p-6">{children}</div>
          </main>
        </div>
      </div>

      <Dialog open={copilotOpen} onOpenChange={setCopilotOpen}>
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Ask CEO OS</DialogTitle>
            <DialogDescription>Company-scoped copilot (local-first).</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="chat" className="h-[70vh] flex flex-col">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="post_meeting">Post-meeting agent</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 min-h-0 mt-3">
              <CopilotChat
                className="h-full"
                instructions={copilotInstructions}
                labels={{ title: "CEO OS", placeholder: "Ask about tasks, meetings, approvals…" }}
              />
            </TabsContent>

            <TabsContent value="post_meeting" className="flex-1 min-h-0 mt-3 overflow-auto">
              <PostMeetingRunner companyId={activeCompanyId} compact />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </CopilotKit>
  );
}


