# CEO OS (PA OS) — Local‑first CEO Operating System

CEO OS is a **local‑first personal assistant platform** for founders/executives. It combines company data (people, tasks, calendar, meetings) with agentic workflows that can **propose actions and wait for human approvals** before applying changes.

This repository is a **TypeScript-only** monorepo (pnpm + Turborepo) intended to run locally on macOS with **Docker (Postgres + Redis)**.

---

## Product overview (business)

### What CEO OS does

- **Turns meetings into execution**
  - Capture live transcript + bookmarks during a meeting
  - Generate minutes, decisions, risks, and action items after the meeting
  - Create an approval card to confirm proposed tasks
- **Provides a company operating surface**
  - Multi-company workspace with quick switching
  - Tasks and people directory as the base operating layer
  - Calendar view + meeting list
- **Adds an in-app copilot**
  - “Ask PA” chat inside the product
  - Can call server tools (e.g. list tasks, create tasks, list meetings)

### Principles

- **Local-first**: core app runs on your machine; data stored in local Postgres.
- **Human-in-the-loop**: agents can propose actions but require explicit approvals for sensitive operations.
- **Production-minded**: durable workflows (LangGraph), background processing (BullMQ), schema migrations (Drizzle).

### Target user journeys

- **Daily ops**
  - Open Dashboard → review meetings, overdue tasks, pending approvals → execute.
- **Calendar to meeting**
  - Connect Google Calendar → sync events locally → create/select meeting → run meeting.
- **Meeting to tasks**
  - Start meeting → capture transcript + bookmarks → finalize → review approval card → approve → tasks created.

---

## Implementation status (original plan: Phase 1–4)

### Phase 1 — Foundation (DONE: vertical slice)

- **Multi-company workspace**: implemented (cookie session includes active `companyId`, switcher in shell).
- **People directory**: implemented (list/create endpoints + UI).
- **Tasks CRUD**: implemented (list/create/update endpoints + UI scaffolding).  
  - Kanban + list view: **partial** (UI scaffolding exists; full Kanban drag/drop + filters polishing remains).

### Phase 2 — Calendar (PARTIAL → usable)

- Google OAuth (Calendar read-only): implemented.
- Local caching of events in Postgres: implemented (worker sync).
- FullCalendar UI: implemented.
- “Generate Prep Pack”: **not fully wired** (graph exists; UI action remains).

### Phase 3 — Meeting Room + Realtime transcription (PARTIAL)

- Meeting detail UI + notes editor: implemented.
- Transcript persistence + segments: implemented via finalize endpoint.
- OpenAI Realtime transcription via WebRTC: **prototype/stub** (hook exists, but production-grade Realtime WebRTC session handling still needs hardening + protocol alignment).

### Phase 4 — Post-meeting agent + approvals (PARTIAL → usable)

- Post-meeting LangGraph flow with HITL approvals: implemented (interrupt + resume).
- Approval Center UI: implemented (approve/reject).
- Durable checkpointing: implemented (Postgres checkpointer).
- “CREATE_TASKS” apply step: implemented (creates tasks after approval).
- CopilotKit panel wired to agent backend: **partial** (in-app Copilot chat is wired to `/api/copilotkit`; AG-UI streaming to LangGraph Platform still pending).

---

## Tech overview (architecture)

### Monorepo layout

- `apps/web`: Next.js (App Router) UI + API routes
- `apps/worker`: BullMQ workers (calendar sync, meeting finalize / agent runs)
- `packages/db`: Drizzle schema + migrations + seed/migrate scripts
- `packages/agents`: LangGraph graphs + “specialists”
- `packages/ui`: shared shadcn/ui components

### Runtime components

- **Web app (Next.js)**: server components + API routes for auth, CRUD, integrations.
- **Postgres**: source of truth for company data, meetings, transcripts, approvals, agent runs.
- **Redis + BullMQ**: background execution (calendar sync, meeting post-processing).
- **LangGraph**: durable workflows + interrupt() approvals.
- **CopilotKit**: in-app chat UI + runtime endpoint for tool calling.

### Key data flows

1) **Login → seed**
- `/api/auth/login` checks `LOCAL_ADMIN_PASSWORD`
- Ensures seed data exists (idempotent)
- Sets cookie session (personId + companyId)

2) **Google Calendar OAuth → sync**
- OAuth callback stores encrypted tokens
- Worker sync pulls events and caches them to `calendar_events`

3) **Meeting → finalize → post-meeting agent**
- Meeting room captures transcript + bookmarks
- `/api/meetings/finalize` persists transcript/assets and triggers processing
- Worker runs post-meeting graph
- Graph creates an approval record → UI shows `/approvals`
- Approve/reject triggers resume + (on approve) creates tasks

---

## Stack (non-negotiables)

- **Next.js (App Router) + TypeScript** (`apps/web`)
- **TailwindCSS + shadcn/ui** (`packages/ui`)
- **CopilotKit** (`/api/copilotkit` + in-app “Ask PA”)
- **FullCalendar** (calendar UI)
- **Tiptap** (meeting notes)
- **Postgres + Drizzle ORM + migrations** (`packages/db`)
- **Redis + BullMQ** (`apps/worker`)
- **OpenAI official JS SDK** (server LLM calls / Realtime scaffolding)
- **LangGraph (JS)** for durable workflows + approvals

---

## Local setup (developer)

### Prereqs

- Docker Desktop running
- Node + pnpm installed

### 1) Install dependencies

```bash
cd pa-os
pnpm install
```

### 2) Configure env

```bash
cp .env.example .env
```

**Never commit secrets.** `.env` is gitignored.

Minimum required:

- `DATABASE_URL` (example: `postgres://paos:paos@localhost:5432/paos`)
- `REDIS_URL` (example: `redis://localhost:6379`)
- `APP_URL` (example: `http://localhost:3000`)
- `TOKEN_ENC_KEY` (used for session signing + token encryption)
- `LOCAL_ADMIN_PASSWORD`

Optional:

- `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `OPENAI_REALTIME_MODEL`, `OPENAI_TRANSCRIPTION_MODEL` (transcription-related)

### 3) Start Docker services

```bash
pnpm docker:up
```

### 4) Migrate DB

```bash
pnpm db:migrate
```

### 5) Run dev (web + worker)

```bash
pnpm dev
```

App:

- Web: `http://localhost:3000`

---

## Operations & troubleshooting

### Common issues

- **`git push` rejected / “fetch first”**
  - Run `git pull --rebase` then `git push`.
- **Postgres volume issues (Postgres 18+)**
  - This repo mounts `/var/lib/postgresql` (parent dir) in `docker/docker-compose.yml`.
- **Next dev lock**
  - If `.next/dev/lock` exists, stop the old Next process and retry.

### Security notes (local-first)

- **Session cookies** are signed with `TOKEN_ENC_KEY`.
- OAuth tokens are stored encrypted (AES/JWE helper) and should never be logged.
- If you accidentally exposed keys, **rotate them immediately**.

---

## Roadmap (what’s next)

- **Tasks UX**: real Kanban drag/drop, richer filters, bulk ops, task assignment UI.
- **Calendar**: render DB-cached events in UI (currently stubbed in some places), prep-pack action wiring.
- **Realtime transcription**: production-grade WebRTC session (protocol correctness, reconnection, partials/finals, VAD).
- **CopilotKit ↔ LangGraph AG-UI streaming**: wire to LangGraph Platform or local AG-UI bridge (durable co-agent UI).
- **Approval editing**: editable approval payload UI (edit tasks before approval).
- **Tests + CI**: add smoke tests for core flows + worker processors.
