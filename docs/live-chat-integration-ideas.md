# Live Chat Integration Ideas for Togra

## Context

The user wants a Slack-like live chat tool built into Togra, scoped to teams and users managed by UUM (ullav-user-management). This is a brainstorm/ideas document — no implementation yet.

---

## What Already Exists (Relevant Infrastructure)

| Asset | Where | Relevance |
|---|---|---|
| NATS messaging | `awe-server/src/bin/awe_relay.rs` | Already used for inter-service pub/sub; ideal backbone for chat fanout |
| PostgreSQL LISTEN/NOTIFY | `awe_relay.rs` | Can trigger real-time events from DB writes |
| Notes model | `awe-server/src/models/note.rs` | Has `parent_id` threading, entity scoping, shared flag, timestamps |
| Team/user model | UUM + JWT `teams` claim | Ready-made auth scoping for channel membership |
| Axum 0.7 | `awe-server` | Supports WebSocket upgrades natively |

---

## Core Concept: Slack-like Channels Scoped to UUM Teams

### Channel model
- **Team channels** — one per UUM team (auto-created); equivalent to a Slack workspace
- **Project channels** — one per Togra Project, visible to the project's team members
- **Direct messages** — 1:1 between any two UUM users
- **Thread replies** — on any message, like Slack threads

Channel membership is derived directly from UUM teams — no separate member list to manage. If a user has access to the team, they can see its channels.

---

## Option A: Build on awe-server (Native / Integrated)

### How it would work
- Add a `chat` domain to awe-server: tables `chat_rooms`, `chat_messages`, `chat_members`
- WebSocket endpoint in Axum (`/ws/chat/:room_id`) — Axum supports this natively
- NATS pub/sub as the fanout layer (message written → published to NATS topic → fanned out to all connected sockets in the room)
- PostgreSQL stores message history; NATS is ephemeral delivery only
- Membership check uses JWT `teams` claim from UUM — no separate auth

### Pros
- Entirely within the existing stack (Rust, Axum, NATS, PostgreSQL, UUM)
- Team/user identity is authoritative via UUM JWT
- Can deep-link from a story or task directly into a project channel with context
- Message history is in your own DB — searchable, exportable, compliant

### Cons
- Non-trivial Rust work: WebSocket connection management, presence tracking, read receipts
- NATS JetStream config needed for at-least-once delivery guarantees
- You own the ops burden

---

## Option B: Matrix + Element (Federated, Self-hosted)

[Matrix](https://matrix.org) is an open, federated chat protocol. Element is its flagship client. You'd run a **Synapse** (or lighter **Dendrite**) homeserver.

### Integration approach
- UUM becomes the identity provider — provision Matrix accounts via the Admin API when users are created in UUM
- Teams in UUM map to Matrix Spaces (Slack workspaces equivalent)
- Togra creates Matrix rooms automatically when a Project or team is created
- Togra frontend embeds the Element Web client (iframe or React SDK) in a sidebar panel
- SSO: UUM issues a short-lived token; Matrix accepts it via a custom SSO bridge (or OIDC if UUM supports it)

### Pros
- Full-featured from day one: threads, reactions, read receipts, voice/video (via Jitsi), E2E encryption
- Federated — users can be reached from other Matrix servers if you want
- Element Web React SDK lets you embed chat without a full page redirect
- Open source, self-hosted — your data

### Cons
- Synapse is heavy (Python, PostgreSQL); Dendrite is lighter but less mature
- SSO bridge between UUM (custom JWT) and Matrix needs building
- Two separate user stores to keep in sync (UUM ↔ Matrix homeserver)
- Running a Matrix homeserver is operationally non-trivial

---

## Option C: Lightweight Embedded Chat via an OSS Backend (e.g. Chatwoot / Tinode / Rocket.Chat embedded)

Several OSS chat servers offer embeddable widgets and REST APIs for provisioning rooms/users. **Tinode** in particular is lightweight Go + gRPC with a React SDK. **Rocket.Chat** is heavier but extremely mature.

### Integration approach
- Run the OSS server alongside awe-server
- Provision users/rooms via their admin API triggered by UUM webhooks (on user/team creation)
- Embed the React widget inside Togra's layout as a collapsible panel

### Pros
- Faster to a working product than building from scratch
- Tinode is small and self-contained; Rocket.Chat has everything

### Cons
- Still a second service to run and maintain
- Less deep integration with Togra context (e.g. linking to a specific story)
- Theming/UX may never feel native to the Togra design

---

## Option D: Minimal "Contextual Chat" Built on Notes

Rather than a full Slack replacement, extend the existing **Notes** model into threaded, real-time contextual chat per entity (Project, Story, Task).

### How it would work
- Add a `chat_type` flag to notes: distinguishes async notes from live chat messages
- Add PostgreSQL LISTEN/NOTIFY on the `notes` table → SSE endpoint in Axum (`/api/notes/stream/:entity_id`) → frontend EventSource
- No NATS changes needed; SSE is simpler than WebSockets for one-way push
- UI: a "Chat" tab alongside "Notes" on the Story/Project page, showing messages in real time

### Pros
- Smallest surface area — reuses everything already built
- No new tables needed initially (extend notes schema)
- SSE is far simpler than WebSockets to implement and reason about
- Feels native: chat is always in the context of a Story or Project

### Cons
- Not a Slack replacement — no DMs, no global search, no presence
- Less suited to free-form team chat; better for "comments on this story"

---

## Recommended Path

**Short term:** Option D (contextual chat on Notes + SSE) — low effort, immediately useful, native to the Togra workflow.

**Medium term:** Option A (native WebSocket chat in awe-server with NATS fanout) — adds team channels and DMs without a second service.

**Long term / ambitious:** Option B (Matrix) — if federation, E2E encryption, or voice/video ever matter. The SSO bridge between UUM and Matrix is the key engineering challenge.

---

## Key Design Decisions to Make Later

1. **Presence** — who is online? Needs a heartbeat mechanism (WebSocket keep-alive or SSE ping)
2. **Read receipts** — per-user, per-message. Needs a `chat_reads` join table
3. **Notifications** — push to Togra's notification system (yet to be built) or email digest via UUM
4. **Search** — PostgreSQL full-text on `chat_messages.body` is straightforward
5. **File sharing** — route uploads through ullav-dam-server (already in the ecosystem)
6. **Mobile** — if a mobile app ever comes, Matrix or a WebSocket-native solution is easier to target than SSE
