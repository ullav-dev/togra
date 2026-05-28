# Togra

Project planning for teams — a JIRA/Confluence replacement built on the AWE stack, part of the [Ullav](https://ullav.com) ecosystem.

## What it does

Togra gives teams a structured way to plan and track work:

- **Projects** group all work for a product or initiative, with an assigned project manager.
- **Sprints and Kanban boards** sit inside a project. Stories move across columns (To Do → In Progress → On Hold → Done) by drag-and-drop or the card menu.
- **Stories** (Workflows) are the core planning unit. Each story has a name, story points, visibility setting, and a sequence of workflow steps.
- **Workflow steps** (Tasks) model the actual work: Design → Development → QA, for example. Each step has its own status and can be assigned to a team member and tagged with team roles.
- **Notes** attach Markdown content and comments to any story, organised into folders.
- **Backlog** holds stories not yet assigned to a sprint, with drag-to-sprint support and search/pagination.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| i18n | next-intl v4 (English, German, Irish) |
| Auth | ullav-user-management (JWT, port 8081) |
| API | awe-server (Rust/Axum, port 8085) |

## Getting started

### Prerequisites

- Node.js 20+
- [awe-server](../awe-server) running on port 8085 (≥ 0.2.0)
- [ullav-user-management](../ullav-user-management) running on port 8081 (with migration `015_user_avatar.sql` applied)

### Run locally

```bash
npm install
npm run dev        # http://localhost:3006
```

### Environment variables

```
API_URL=http://localhost:8085          # awe-server (server-side only)
AUTH_URL=http://localhost:8081         # ullav-user-management (server-side only)
NEXT_PUBLIC_IDLE_TIMEOUT_MS=3600000   # idle logout timeout in ms (default: 1 hour)
```

These are server-side only — do not prefix backend URLs with `NEXT_PUBLIC_`.

### Other commands

```bash
npm run build   # production build (outputs standalone)
npm run lint    # ESLint
npm test        # Jest
```

## Project structure

```
src/
  app/[locale]/
    login/                           # Login page
    (protected)/
      projects/                      # Project list + create
      projects/[id]/                 # Project detail + sprint/board list
      projects/[id]/jobs/[jobId]/    # Sprint or Kanban board
      projects/[id]/stories/[storyId]/  # Story detail + workflow steps + notes
  components/
    Nav.tsx                  # Top navigation with user avatar and My Details
    MyDetailsModal.tsx       # Edit name and avatar (Gravatar or custom URL)
    ConfirmDialog.tsx        # Modal confirmation (replaces window.confirm)
    StatusPill.tsx           # Coloured status badge
    MarkdownEditor.tsx       # Markdown input with preview toggle
    VisibilityToggle.tsx     # Shared / private toggle
    notes/NotesPanel.tsx     # Notes with folder organisation
  contexts/
    AuthContext.tsx           # Session state, idle timeout, profile update
  lib/
    auth-api.ts              # Auth service API + JWT helpers + Gravatar
    awe-api.ts               # AWE server API (jobs, workflows, tasks, notes, teams)
    togra-api.ts             # Project CRUD
    types.ts                 # Shared TypeScript types
  proxy.ts                   # API rewrites + next-intl middleware
messages/                    # Translation files: en.json, de.json, ga.json
```

## User profiles and avatars

Users can update their name and avatar from the **My Details** menu in the top navigation. Avatars are stored as HTTPS URLs — either a [Gravatar](https://gravatar.com) link (generated automatically from the email address) or any other HTTPS image URL such as one from the Ullav DAM. Avatars fall back to an initials badge on any load error.

On the sprint and kanban boards, each story card shows a small cluster of avatars representing everyone assigned to a task within that story.

## Authentication

Access requires an account on the connected `ullav-user-management` service with the `obair` product enabled for at least one team. The session is stored in `localStorage` under the key `togra_auth` and expires after one hour of inactivity (with a 60-second warning).

## Deployment

The app builds as a Next.js standalone output suitable for Docker:

```bash
npm run build
# standalone output in .next/standalone
```

See the workspace-level `ullav-helm` charts for Kubernetes deployment.
