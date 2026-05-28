# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Togra** is a project planning tool (JIRA/Confluence replacement) built on the AWE stack. It is part of the Ullav ecosystem — see `/Users/colin/github/CLAUDE.md` for full workspace context.

- **Dev port:** 3006 (`npm run dev` → `http://localhost:3006`)
- **API backend:** awe-server on port 8085
- **Auth service:** ullav-user-management on port 8081
- **localStorage key:** `togra_auth`
- **Primary colour:** violet-600 (`#7c3aed`)

## Commands

```bash
npm run dev      # start dev server on port 3006
npm run build    # production build
npm run lint     # ESLint
npm test         # Jest
```

## Domain Model

| Concept | AWE Entity | Notes |
|---|---|---|
| Project | `projects` table (new in awe-server 0.2.0) | Groups Jobs; has a PM user |
| Sprint / Kanban Board | `Job` with `job_type = "sprint"` or `"kanban"` | Belongs to a Project; may belong to a team |
| Workflow | `Workflow` under a Job | Models task flow: e.g. Design → Dev → QA |
| Story | `Task` on a Workflow | Status, assignment, team roles already on Task |
| Story content / comments | `Note` on the Task entity | Markdown body; richer content goes to Comad |

A Project spans multiple teams. Each Job has its own `team_id`; the Project's `team_id` is the owner team for access context only.

Auth uses the `obair` product gate (piggybacks on Obair access for now).

## Stack

| Tool | Version |
|---|---|
| Next.js | 16.1.6 (App Router) |
| React | 19.2.3 |
| TypeScript | 5.x |
| Tailwind CSS | v4 (`@tailwindcss/postcss`) |
| next-intl | v4.9 |

## Architecture

### Routing & i18n

- Routes are locale-prefixed: `/en/`, `/de/`, `/ga/`
- i18n config in `src/i18n/routing.ts`, `request.ts`, `navigation.ts`
- Middleware in `src/proxy.ts` — Next.js 16 uses `proxy.ts`, not `middleware.ts`. Do NOT create both; they conflict.

### API Proxy

- `/api/*` → awe-server (`API_URL`, default `http://localhost:8085`)
- `/auth-api/*` → ullav-user-management (`AUTH_URL`, default `http://localhost:8081`)

### Key directories

```
src/
  app/[locale]/              # Locale-aware pages
    login/                   # Login page (violet theme)
    (protected)/             # Auth-guarded routes
      projects/              # Projects list + create
      projects/[id]/         # Project detail + jobs
      projects/[id]/jobs/[jobId]/  # Kanban board
  components/                # TograIcon, Nav, Footer, StatusPill
  contexts/
    AuthContext.tsx           # Auth state, idle timeout, SSO
  lib/
    auth-api.ts              # UUM API + JWT helpers (hasTograAccess gate)
    awe-api.ts               # AWE server API (jobs, workflows, tasks, notes, teams)
    togra-api.ts             # Project CRUD against /projects endpoints
    types.ts                 # Domain types
  i18n/                      # next-intl config
  proxy.ts                   # Rewrites + intl middleware
messages/                    # Translation files (en, de, ga)
```

## Environment Variables

```
API_URL=http://localhost:8085   # server-side only
AUTH_URL=http://localhost:8081  # server-side only
```

`NEXT_PUBLIC_*` vars are build-time — do not use for backend URLs.

## awe-server Dependency

Requires awe-server ≥ 0.2.0 for the `projects` entity and `job_type` / `project_id` fields on Jobs. See `/Users/colin/github/awe-server/migrations/028_projects.sql`.
