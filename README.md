# PA-OS

Personal Assistant OS monorepo powering multi-company task, meeting, and approval workflows.

## What’s inside

- **apps/web**: Next.js (App Router) web UI + API routes.
- **apps/worker**: background worker (BullMQ) for agent runs, approvals, and async jobs.
- **packages/db**: Drizzle ORM schema, migrations, and database helpers.
- **packages/agents**: agent logic and orchestration.
- **packages/ui**: shared UI components.

## Tech stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API routes + background worker
- **DB**: Postgres + Drizzle ORM
- **Queue**: BullMQ + Redis
- **Auth/Integrations**: Google Calendar OAuth (read-only)
- **AI**: OpenAI (transcription + agent workflows)

## Prerequisites

- Node.js (see `package.json` engines if you add one)
- pnpm 9
- Postgres
- Redis

## Environment

Copy the template and fill in required values:

```bash
cp .env.example .env
```

Required keys for core flows:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_URL`
- `TOKEN_ENC_KEY` (base64 32-byte key)
- `LOCAL_ADMIN_PASSWORD`

Optional integrations:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_TRANSCRIPTION_MODEL`
- `COPILOTKIT_PUBLIC_NAME`, `COPILOTKIT_AGENT_ROUTE`

## Install

```bash
pnpm install
```

## Database

```bash
pnpm db:migrate
pnpm db:seed
```

## Run (local)

```bash
pnpm dev
```

- Web app: `http://localhost:3000`
- Worker runs via `turbo run dev --parallel` and starts automatically

## Build

```bash
pnpm build
```

## Lint & typecheck

```bash
pnpm lint
pnpm turbo run typecheck
```

## Key directories

- `apps/web/app/(shell)`: primary app routes (tasks, calendar, meetings, approvals)
- `apps/web/app/api`: server endpoints
- `packages/db/src/schema.ts`: database schema
- `apps/worker/src`: background processing

## Checklists & QA

See `ASSESSMENT_REPORT.md` for the acceptance checklist audit, evidence, gaps, and next steps.
