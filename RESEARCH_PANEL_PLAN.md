# Research Panel — Implementation Plan

## Branch
`feat/research-panel` from `main`

---

## 1. UUM backend — AI settings storage

**New migration** `016_user_ai_settings.sql` in `ullav-user-management`:

```sql
CREATE TABLE user_ai_settings (
  username      TEXT PRIMARY KEY,
  provider      TEXT NOT NULL DEFAULT 'anthropic',
  model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  encrypted_key TEXT,
  iv            TEXT,
  auth_tag      TEXT,
  ollama_url    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**New handler** `src/handlers/user_ai_settings.rs`:
- `GET /users/me/ai-settings` — returns settings without encrypted key (`has_key: bool`)
- `PUT /users/me/ai-settings` — stores provider, model, ollama_url; if a new key is provided, stores encrypted blob; if not, preserves existing encrypted blob
- `DELETE /users/me/ai-settings` — removes row

All three routes use the existing `AuthUser` extractor (JWT-protected).

**Note:** Storing settings in UUM rather than awe-server means they are shared across all Ullav apps
(Clann, Cartlann, Togra) once those apps are migrated to the same endpoint. Togra is the first
app to use UUM for AI settings; Clann and Cartlann currently use their own servers and can be
migrated separately.

---

## 2. awe-server backend — chat sessions

**New migrations** (next available is `039_`):

`039_ai_chat_sessions.sql`:
```sql
CREATE TABLE ai_chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_chat_messages_session_idx ON ai_chat_messages(session_id, created_at);
```

**New handler** `src/handlers/ai_chat_sessions.rs`:
- `GET  /ai-sessions` — list sessions for authenticated user (newest first)
- `POST /ai-sessions` — create session (`{ title }`)
- `DELETE /ai-sessions/{id}` — delete session (must belong to user)
- `GET  /ai-sessions/{id}/messages` — list messages in order
- `POST /ai-sessions/{id}/messages` — append message (`{ role, content }`)

---

## 3. Togra proxy carve-out

In `src/proxy.ts`, add before the general `/api/*` rule (same pattern as `/api/dam/*`):

```ts
// Let Next.js handle /api/ai/* locally (streaming AI routes must not be proxied)
if (pathname.startsWith("/api/ai/")) {
  return NextResponse.next();
}
```

---

## 4. New npm packages

```bash
npm install ai @ai-sdk/react @ai-sdk/anthropic @ai-sdk/openai \
  @ai-sdk/google @ai-sdk/mistral @ai-sdk/openai-compatible
```

Match versions to those in `clann-webapp/package.json`.

**New env var** added to `.env.local` and documented in `CLAUDE.md`:
```
SETTINGS_ENCRYPTION_KEY=<32-byte hex string>   # AES-256-GCM key for AI key encryption
```

---

## 5. New Togra lib files

**`src/lib/ai-settings.ts`** — copy from Clann, unchanged:
- `encryptKey(plaintext, hexKey)` — AES-256-GCM → `{ encrypted, iv, authTag }`
- `decryptKey(encrypted, iv, authTag, hexKey)` — returns plaintext key
- `usernameFromBearer(token)` — decodes JWT `sub` / `username` claim

**`src/lib/research-api.ts`** — typed client for awe-server chat session endpoints:
- `listChatSessions(token)`
- `createChatSession(token, title)`
- `deleteChatSession(token, id)`
- `listSessionMessages(token, sessionId)`
- `appendSessionMessage(token, sessionId, role, content)`

---

## 6. New Next.js API routes

**`src/app/api/ai/settings/route.ts`**
- `GET` — fetches from `${AUTH_URL}/users/me/ai-settings`, returns settings with `hasKey` bool (no key material)
- `POST` — if a new key is provided, encrypts it with `SETTINGS_ENCRYPTION_KEY` before forwarding; otherwise preserves existing encrypted blob
- `DELETE` — forwards delete to UUM

Proxies to `${AUTH_URL}` (ullav-user-management), NOT `${API_URL}` (awe-server).

**`src/app/api/ai/chat/route.ts`**
- `POST` — streaming chat handler using Vercel AI SDK `streamText`
- Receives `{ messages, storyContext?, taskContext? }` in body
- Fetches AI settings from `/api/ai/settings`, decrypts key, selects provider
- System prompt: project planning / agile assistant (see below)
- Returns a streaming response via `result.toDataStreamResponse()`

**Togra system prompt (draft):**
```
You are an expert agile project planning assistant embedded in Togra, a project management tool.
Your role is to help teams define, refine, and break down work.

You specialise in:
- Writing clear user stories and acceptance criteria
- Breaking stories into concrete tasks
- Estimating story complexity and surfacing risks
- Drafting definitions of done
- Identifying dependencies and ambiguities

Keep responses concise and actionable. Use markdown formatting.
Prefer bullet points and numbered lists over long prose.
```

Context is injected per-request when the user is viewing a specific story or task.

---

## 7. New React components

### `src/components/research/AiChat.tsx`

Adapted from `ullav-collection-browser/src/components/AiChat.tsx` (Cartlann — most refined version).

**Props:**
```ts
interface Props {
  token: string;
  storyId?: string;
  taskId?: string;
  storyTitle?: string;
  taskTitle?: string;
  storyDescription?: string;
  onSaveAsNote: (text: string) => void;
}
```

**Key behaviours:**
- `DefaultChatTransport` with `Authorization` header and body containing story/task context strings
- Context refs pattern (avoid stale closures in transport)
- Template prompts specific to project planning:
  - "Write acceptance criteria for this story"
  - "Break this story into tasks"
  - "Identify risks and unknowns"
  - "Suggest story points"
  - "Draft a definition of done"
- Session history panel — list sessions, create new, delete, switch
- Per-message "Save as note" button → calls `onSaveAsNote(messageText)`
- Violet-600 branding throughout

### `src/components/research/ResearchPanel.tsx`

Single panel component, mounted in three places with different context.

**Props:**
```ts
interface Props {
  token: string;
  entityType: "workflow" | "task" | "board";
  entityId: string;
  storyId?: string;
  storyTitle?: string;
  taskTitle?: string;
  storyDescription?: string;
  onClose: () => void;
}
```

**Structure:**
- Tab bar: **AI Research** (only tab in v1; shell is extensible for future explorers)
- `AiChat` in the AI Research tab
- `onSaveAsNote` callback: opens a small inline form with title, shared/private toggle, markdown preview → calls `createNote` from `notes-api.ts` targeting the appropriate entity
- Full-height right panel with a close (`×`) button at the top
- No dedicated route — always rendered as an overlay/sidebar

### `src/components/research/AiSettingsModal.tsx`

Small modal accessible from the Nav dropdown.

- Provider selector: Anthropic / OpenAI / Google / Mistral / Ollama
- Model text input (pre-filled per provider)
- API key field (write-only; shows "Key saved" indicator when `hasKey` is true)
- Ollama URL field (shown only when provider = Ollama)
- Save / Delete buttons
- Violet-600 branding

---

## 8. Integration points

| Surface | Trigger | Panel context |
|---|---|---|
| **Ideas Board** | "Research" button in board toolbar | `entityType="board"`, `entityId=boardId`; no story/task context |
| **Story detail page** | "Research" button in story header | `entityType="workflow"`, `entityId=storyId`, `storyTitle`, `storyDescription` |
| **Sprint board** | "Research" button in `TaskDetailModal` header | `entityType="task"`, `entityId=taskId`, `taskTitle`, plus parent `storyId`/`storyTitle` |

**Notes saved from research** always use the existing `createNote` from `notes-api.ts` with the appropriate `entity_type` / `entity_id`. Zero backend changes required for notes.

---

## 9. AI Settings hook-up in Nav

Add "AI Settings" item to the user dropdown in `Nav.tsx` → opens `AiSettingsModal`. No new page required.

---

## 10. Translations

Add keys to `messages/en.json`, `messages/de.json`, `messages/ga.json` under two namespaces:

```json
"research": {
  "title": "Research",
  "aiResearch": "AI Research",
  "newChat": "New chat",
  "saveAsNote": "Save as note",
  "templates": "Suggestions",
  "history": "Chat history",
  "deleteSession": "Delete chat",
  "placeholder": "Ask anything about this story…"
},
"aiSettings": {
  "title": "AI Settings",
  "provider": "Provider",
  "model": "Model",
  "apiKey": "API Key",
  "keySaved": "Key saved",
  "ollamaUrl": "Ollama URL",
  "save": "Save",
  "delete": "Remove settings"
}
```

---

## Implementation sequence

1. **UUM** — migration `016_user_ai_settings.sql` + handler `user_ai_settings.rs`
2. **awe-server** — migration `039_ai_chat_sessions.sql` + handler `ai_chat_sessions.rs`
3. **Togra proxy** — carve-out for `/api/ai/*` in `src/proxy.ts`
4. **npm packages** — install AI SDK packages; add `SETTINGS_ENCRYPTION_KEY` to env
5. **Lib files** — `ai-settings.ts`, `research-api.ts`
6. **API routes** — `src/app/api/ai/settings/route.ts`, `src/app/api/ai/chat/route.ts`
7. **Components** — `AiChat.tsx`, `ResearchPanel.tsx`, `AiSettingsModal.tsx`
8. **Nav** — wire `AiSettingsModal` to user dropdown
9. **Integration** — mount `ResearchPanel` in Ideas Board → Story detail → Sprint board
10. **Translations** — add keys to all three locale files
