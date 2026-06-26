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
| Project | `projects` table (awe-server ≥ 0.2.0) | Groups Jobs; has a PM user |
| Sprint / Kanban Board | `Job` with `job_type = "sprint"` or `"kanban"` | Belongs to a Project; may belong to a team |
| Story | `Workflow` under a Job | The main planning unit; has status, story points, visibility |
| Workflow step / Task | `Task` on a Workflow | Status, assignment, team roles |
| Story content / comments | `Note` on the Workflow entity | Markdown body |

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
- Middleware lives in `src/proxy.ts` — Next.js 16 uses `proxy.ts`, not `middleware.ts`. **Do NOT create both; they conflict.**

### API Proxy

- `/api/*` → awe-server (`API_URL`, default `http://localhost:8085`)
- `/auth-api/*` → ullav-user-management (`AUTH_URL`, default `http://localhost:8081`)

Both rewrites strip the prefix and forward all request headers (including `Authorization: Bearer <token>`).

### Auth

- `AuthContext.tsx` holds the session (`user`, `token`, `roles`) in React state and mirrors it to localStorage under `togra_auth`.
- `updateUser(user)` in AuthContext updates both state and localStorage — use this after any profile PATCH so the nav avatar refreshes without re-login.
- The `hasTograAccess` gate checks for the `obair` product in the JWT `teams` claim.
- Idle timeout: 1 h (configurable via `NEXT_PUBLIC_IDLE_TIMEOUT_MS`). A 60-second warning modal appears before auto-logout.

### User Profiles & Avatars

- `GET /auth-api/users/me` — fetch current user profile.
- `PATCH /auth-api/users/me` — update `first_name`, `last_name`, `avatar_url` (HTTPS URL; `null` clears).
- Avatar URLs are stored as plain HTTPS strings (Gravatar, DAM, or any CDN). The `gravatarUrl(email)` helper in `auth-api.ts` generates a SHA-256 Gravatar URL via `crypto.subtle`.
- All avatar `<img>` elements should have an `onError` fallback to an initials pill to handle broken URLs gracefully.

### Key directories

```
src/
  app/[locale]/              # Locale-aware pages
    login/                   # Login page (violet theme)
    (protected)/             # Auth-guarded routes (layout checks token)
      projects/              # Projects list + create
      projects/[id]/         # Project detail + jobs list
      projects/[id]/jobs/[jobId]/      # Sprint / Kanban board
      projects/[id]/stories/[storyId]/ # Story detail + workflow steps + notes
  components/
    Nav.tsx                  # Top nav with user avatar, dropdown, MyDetailsModal trigger
    MyDetailsModal.tsx       # Edit first/last name + avatar URL; Gravatar helper
    ConfirmDialog.tsx        # Reusable confirm modal — use instead of window.confirm()
    StatusPill.tsx           # Coloured status badge
    MarkdownEditor.tsx       # Markdown input with preview
    VisibilityToggle.tsx     # Shared/private toggle
    notes/NotesPanel.tsx     # Notes sidebar (folders + markdown notes)
    research/AiChat.tsx      # AI chat component (violet branding, agile templates, session history)
    research/ResearchPanel.tsx  # Research panel container (tab shell, save-as-note form)
    research/AiSettingsModal.tsx  # AI provider/model/key settings modal (opened from Nav)
  contexts/
    AuthContext.tsx           # Auth state, idle timeout, updateUser
  lib/
    auth-api.ts              # UUM API: login, profile CRUD, JWT helpers, gravatarUrl
    awe-api.ts               # AWE server API: jobs, workflows, tasks, notes, teams
    togra-api.ts             # Project CRUD against /projects endpoints
    types.ts                 # Shared domain types (TeamUserRef includes avatar_url)
    ai-settings.ts           # AES-256-GCM encrypt/decrypt for AI keys (server-side only)
    research-api.ts          # Chat session CRUD against awe-server /ai-sessions endpoints
  i18n/                      # next-intl config
  proxy.ts                   # API rewrites + intl middleware (this IS the middleware)
messages/                    # Translation files (en, de, ga)
```

## Environment Variables

```
API_URL=http://localhost:8085   # server-side only (awe-server)
AUTH_URL=http://localhost:8081  # server-side only (ullav-user-management)
NEXT_PUBLIC_IDLE_TIMEOUT_MS=3600000  # optional, default 1 hour
SETTINGS_ENCRYPTION_KEY=<32-char hex>  # AES-256-GCM key for AI API key encryption (Research Panel)
```

`NEXT_PUBLIC_*` vars are baked in at build time — do not use for backend URLs.

## awe-server Dependency

Requires awe-server ≥ 0.2.0 for the `projects` entity and `job_type` / `project_id` fields on Jobs. See `/Users/colin/github/awe-server/migrations/028_projects.sql`.

## ullav-user-management Dependency

Requires `avatar_url TEXT` column on `users` (migration `015_user_avatar.sql`). The `PATCH /users/me` SQL must use explicit type casts (`$2::text`, `$3::text`, `$4::bool`, `$5::text`) — tokio_postgres sends OID 0 for untyped params and Postgres cannot infer the types in COALESCE/CASE expressions without hints.

## UI Conventions

- No `window.confirm()` or `window.alert()` — always use `ConfirmDialog`.
- Avatar images always fall back to an initials pill (violet-100 background, violet-700 text) on load error.
- Assignee avatars on the kanban board show as an overlapping cluster (max 4, then `+N`) derived from all tasks in the story at board load time.
