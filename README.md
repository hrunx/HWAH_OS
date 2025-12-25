# CEO OS (PA OS) — Local-first Personal Assistant Platform

**CEO OS** is a local-first, production-minded PA system for running a company day-to-day: tasks, people, calendar, meetings (realtime transcription), and post‑meeting agent workflows with **human approvals**.

This repo is a **pnpm + Turborepo** monorepo (all TypeScript) designed to run locally on macOS with **Docker (Postgres + Redis)**.

## What’s included (vertical slice)

- **Phase 1 — Foundation**
  - Multi-company workspace (company-scoped navigation + switching)
  - People directory (basic CRUD)
  - Tasks CRUD (status/priority/due dates; UI scaffolding)
- **Phase 2 — Calendar**
  - Google OAuth (Calendar read-only)
  - Worker-based sync into Postgres cache
  - FullCalendar UI (week/day/month views)
  - Create meetings from calendar UI
- **Phase 3 — Meeting room**
  - “Start Meeting” UI
  - Live transcript UI (client-side streaming hook + persist on finalize)
  - Bookmark markers (persisted)
  - Tiptap notes editor (saved to DB)
- **Phase 4 — Post-meeting agent + approvals**
  - LangGraph durable workflow (`postMeetingGraph`) with HITL `interrupt()`
  - Approval Center UI (approve/reject)
  - CopilotKit in-app chat (“Ask PA”) wired to `/api/copilotkit`

## Stack (non-negotiables)

- **Next.js (App Router) + TypeScript** (`apps/web`)
- **TailwindCSS + shadcn/ui** (`packages/ui`)
- **CopilotKit** (UI + runtime endpoint)
- **FullCalendar** (calendar UI)
- **Tiptap** (meeting notes)
- **Postgres + Drizzle ORM + migrations** (`packages/db`)
- **Redis + BullMQ workers** (`apps/worker`)
- **OpenAI official JS SDK** (server calls)
- **LangGraph (JS)** for durable workflows + approvals

## Quickstart (local)

### 1) Prereqs

- Docker Desktop running
- Node + pnpm installed

### 2) Configure env

Copy the example env and fill values:

```bash
cd pa-os
cp .env.example .env
```

**Minimum required** to boot:

- `DATABASE_URL` (example: `postgres://paos:paos@localhost:5432/paos`)
- `REDIS_URL` (example: `redis://localhost:6379`)
- `APP_URL` (example: `http://localhost:3000`)
- `TOKEN_ENC_KEY` (used for cookie session signing + encryption; use a long random secret)
- `LOCAL_ADMIN_PASSWORD` (password for local login)

Optional feature env:

- **Copilot / agents / meeting scribe**: `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`)
- **Google Calendar**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### 3) Start Postgres + Redis

```bash
pnpm docker:up
```

### 4) Run DB migrations

```bash
pnpm db:migrate
```

### 5) Start the app (web + worker)

```bash
pnpm dev
```

Visit `http://localhost:3000` and log in with `LOCAL_ADMIN_PASSWORD`.

> Login is **local-only** and will ensure a baseline seed dataset exists.

## Key flows to verify

- **Tasks**
  - Open `/tasks` (company-scoped)
- **Calendar**
  - Open `/calendar`
  - Connect Google Calendar (if configured) and run a sync
- **Meetings → approvals**
  - Create a meeting in `/calendar`
  - Open it in `/meetings`
  - Finalize a meeting (stores transcript + bookmarks + enqueues post-meeting processing)
  - Ensure `apps/worker` is running so the post-meeting job executes
  - Review approvals at `/approvals`
- **Ask PA (CopilotKit)**
  - Click **Ask PA** in the top bar
  - The copilot is company-scoped and can call server tools (e.g. list/create tasks)

## Repo layout

- `apps/web`: Next.js app (routes, UI, API routes)
- `apps/worker`: BullMQ workers (calendar sync, meeting finalize, agent runs)
- `packages/db`: Drizzle schema + migrations + seed/migrate scripts
- `packages/agents`: LangGraph graphs + specialists (meeting prep, post-meeting)
- `packages/ui`: shared shadcn/ui components + styling utilities
