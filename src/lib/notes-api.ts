// Idea Boards API — IdeaBoard, StickyNote, NoteLink, BoardShape. Plain
// Notes/NoteFolder functions (once here too, awe-server-backed) were
// removed once nothing called them any more -- every frontend's plain
// Notes UI now goes through @ullav-dev/tack-notes directly, not this file.
// Intentionally separate from awe-api.ts so this module can be extracted
// to a dedicated Notes service in future without touching AWE code.

import type {
  IdeaBoard,
  StickyNote,
  StickyOrigin,
  NoteLink,
} from "./types";
import type { BoardShape, CreateBoardShape, UpdateBoardShape } from "@ullav-dev/diagram-shapes";

// Idea Boards live on tack-server (Phase 5 of the AWE-apps Notes migration)
// -- go through togra's `/api/tack/*` proxy rule client-side (the same one
// the @ullav-dev/tack-notes package's NotesPanel already relies on) rather
// than `/api/*`, which would route to awe-server.
const TACK_BASE =
  typeof window === "undefined"
    ? (process.env.TACK_URL ?? "http://localhost:8087")
    : "/api/tack";

async function tackApiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${TACK_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

/**
 * Idea Boards render a whole canvas at once -- there's no "load more"
 * affordance the way a paginated list has room for, so a board's own
 * content (stickies/shapes/links) needs to be fetched in full. tack-
 * server's list endpoints are still real `limit`/`offset` pagination
 * underneath (never an unbounded query -- see tack's own CLAUDE.md "design
 * for scale by default"), so this exhausts every page into one array
 * instead of trusting a single request to return everything.
 */
async function tackFetchAllPages<Page, Item>(
  path: string,
  token: string,
  unwrap: (page: Page) => { items: Item[]; total: number },
): Promise<Item[]> {
  const limit = 100;
  let offset = 0;
  const all: Item[] = [];
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await tackApiRequest<Page>(`${path}${sep}limit=${limit}&offset=${offset}`, token);
    const { items, total } = unwrap(page);
    all.push(...items);
    offset += items.length;
    if (items.length === 0 || all.length >= total) break;
  }
  return all;
}

// ── Ideas Boards (tack-server, Phase 5) ─────────────────────────────────────────
//
// tack-server's Idea Boards API (see tack-server's handlers::idea_boards) has a
// different wire shape than awe-server's old one: a board is tack's generic
// NoteFolder (no project_id/created_by columns -- board.created_by was only
// ever used for display in awe, never a permission gate here, so dropping it
// is safe), a sticky's id field is `note_id` not `id`, its body is
// `body_markdown` not `body`, and its story soft-link is a generic
// `linked_entity_type`/`linked_entity_id` pair instead of a dedicated
// `workflow_id` column. Every function below maps tack's shape back onto the
// existing `IdeaBoard`/`StickyNote`/`StickyOrigin`/`NoteLink` types from
// ./types (BoardShape and NoteLink themselves already match tack's wire
// shape field-for-field, so those two need no mapping) -- this keeps
// IdeaBoard.tsx/StickyCard.tsx (~2000 lines of canvas UI) and both page.tsx
// call sites unchanged; only this file and the one createIdeaBoard call site
// (which now needs a team id) change.

type TackNoteFolder = {
  id: string;
  team_id: string;
  name: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

type TackSticky = {
  note_id: string;
  board_id: string;
  title: string;
  body_markdown: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
};

function toIdeaBoard(f: TackNoteFolder): IdeaBoard {
  return {
    id: f.id,
    name: f.name,
    project_id: f.entity_type === "project" ? (f.entity_id ?? "") : "",
    created_by: "",
    created_at: f.created_at,
  };
}

function toStickyNote(s: TackSticky): StickyNote {
  return {
    id: s.note_id,
    title: s.title,
    body: s.body_markdown,
    color: s.color as StickyNote["color"],
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    created_by: s.created_by,
    created_at: s.created_at,
    updated_at: s.updated_at,
    workflow_id: s.linked_entity_type === "workflow" ? s.linked_entity_id : null,
  };
}

export const listIdeaBoards = async (token: string, projectId: string): Promise<IdeaBoard[]> => {
  const boards = await tackApiRequest<TackNoteFolder[]>(
    `/idea-boards/by-entity?owning_service=awe&entity_type=project&entity_id=${projectId}`,
    token,
  );
  return boards.map(toIdeaBoard);
};

export const createIdeaBoard = async (token: string, projectId: string, teamId: string, name: string): Promise<IdeaBoard> => {
  const board = await tackApiRequest<TackNoteFolder>("/idea-boards", token, {
    method: "POST",
    body: JSON.stringify({
      team_id: teamId,
      name,
      attach: { owning_service: "awe", entity_type: "project", entity_id: projectId },
    }),
  });
  return toIdeaBoard(board);
};

export const getIdeaBoard = async (token: string, boardId: string): Promise<IdeaBoard> =>
  toIdeaBoard(await tackApiRequest<TackNoteFolder>(`/idea-boards/${boardId}`, token));

export const updateIdeaBoard = async (token: string, boardId: string, name: string): Promise<IdeaBoard> =>
  toIdeaBoard(
    await tackApiRequest<TackNoteFolder>(`/idea-boards/${boardId}`, token, { method: "PATCH", body: JSON.stringify({ name }) }),
  );

export const deleteIdeaBoard = (token: string, boardId: string): Promise<void> =>
  tackApiRequest(`/idea-boards/${boardId}`, token, { method: "DELETE" });

// ── Stickies ───────────────────────────────────────────────────────────────────

export const listStickies = async (token: string, boardId: string): Promise<StickyNote[]> => {
  const stickies = await tackFetchAllPages<{ stickies: TackSticky[]; total: number }, TackSticky>(
    `/idea-boards/${boardId}/stickies`,
    token,
    (page) => ({ items: page.stickies, total: page.total }),
  );
  return stickies.map(toStickyNote);
};

export const createSticky = async (
  token: string,
  boardId: string,
  payload: {
    title: string;
    body?: string;
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }
): Promise<StickyNote> => {
  const sticky = await tackApiRequest<TackSticky>(`/idea-boards/${boardId}/stickies`, token, {
    method: "POST",
    body: JSON.stringify({
      title: payload.title,
      body_markdown: payload.body ?? "",
      color: payload.color,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
    }),
  });
  return toStickyNote(sticky);
};

export const updateSticky = async (
  token: string,
  boardId: string,
  noteId: string,
  patch: {
    title?: string;
    body?: string;
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    workflow_id?: string;
  }
): Promise<StickyNote> => {
  // boardId is unused here (tack addresses a sticky by note_id alone,
  // globally -- see Sticky's own doc comment in tack-server) but kept in
  // the signature so neither call site above needs to change.
  void boardId;
  const sticky = await tackApiRequest<TackSticky>(`/stickies/${noteId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      title: patch.title,
      body_markdown: patch.body,
      color: patch.color,
      x: patch.x,
      y: patch.y,
      width: patch.width,
      height: patch.height,
      linked_entity_type: patch.workflow_id !== undefined ? "workflow" : undefined,
      linked_entity_id: patch.workflow_id,
    }),
  });
  return toStickyNote(sticky);
};

/**
 * tack-server returns `Sticky | null` directly (no 404 for "no origin"),
 * and has no board name of its own on a sticky -- a second lookup resolves
 * it, same information `StickyOrigin` always carried, just assembled from
 * two calls instead of one join awe-server used to do server-side.
 */
export const getStickyByWorkflow = async (token: string, workflowId: string): Promise<StickyOrigin | null> => {
  const sticky = await tackApiRequest<TackSticky | null>(
    `/stickies/by-entity?entity_type=workflow&entity_id=${workflowId}`,
    token,
  );
  if (!sticky) return null;
  const board = await getIdeaBoard(token, sticky.board_id).catch(() => null);
  return { board_id: sticky.board_id, board_name: board?.name ?? "", sticky: toStickyNote(sticky) };
};

export const deleteSticky = (token: string, boardId: string, noteId: string): Promise<void> => {
  void boardId; // see updateSticky's comment
  return tackApiRequest(`/stickies/${noteId}`, token, { method: "DELETE" });
};

// ── Note Links ─────────────────────────────────────────────────────────────────
// NoteLink's wire shape already matches tack-server's field-for-field, so no
// mapping function is needed here (unlike stickies/boards above).

export const listNoteLinks = (token: string, boardId: string): Promise<NoteLink[]> =>
  tackFetchAllPages<{ links: NoteLink[]; total: number }, NoteLink>(
    `/idea-boards/${boardId}/links`,
    token,
    (page) => ({ items: page.links, total: page.total }),
  );

export const createNoteLink = (
  token: string,
  boardId: string,
  fromNoteId: string,
  toNoteId: string,
  label?: string,
  fromPort?: string,
  toPort?: string,
): Promise<NoteLink> =>
  tackApiRequest(`/idea-boards/${boardId}/links`, token, {
    method: "POST",
    body: JSON.stringify({ from_note_id: fromNoteId, to_note_id: toNoteId, label, from_port: fromPort, to_port: toPort }),
  });

/** Create a link where either endpoint may be a shape or a sticky. */
export const createBoardLink = (
  token: string,
  boardId: string,
  from: { noteId?: string; shapeId?: string },
  to: { noteId?: string; shapeId?: string },
  fromPort?: string,
  toPort?: string,
): Promise<NoteLink> =>
  tackApiRequest(`/idea-boards/${boardId}/links`, token, {
    method: "POST",
    body: JSON.stringify({
      from_note_id:  from.noteId  ?? null,
      from_shape_id: from.shapeId ?? null,
      to_note_id:    to.noteId    ?? null,
      to_shape_id:   to.shapeId   ?? null,
      from_port: fromPort,
      to_port:   toPort,
    }),
  });

export const updateNoteLink = (token: string, linkId: string, label: string | null): Promise<NoteLink> =>
  tackApiRequest(`/links/${linkId}`, token, { method: "PATCH", body: JSON.stringify({ label }) });

export const deleteNoteLink = (token: string, linkId: string): Promise<void> =>
  tackApiRequest(`/links/${linkId}`, token, { method: "DELETE" });

// ── Board Shapes ──────────────────────────────────────────────────────────────
// BoardShape's wire shape already matches tack-server's field-for-field
// (verified against @ullav-dev/diagram-shapes' own type), so no mapping.
// One behavior improvement, not a breaking change: tack's `image_url: null`
// on PATCH actually clears the column (a real tri-state), where awe-
// server's was a documented no-op -- see UpdateBoardShape's own comment in
// packages/diagram-shapes.

export const listShapes = (token: string, boardId: string): Promise<BoardShape[]> =>
  tackFetchAllPages<{ shapes: BoardShape[]; total: number }, BoardShape>(
    `/idea-boards/${boardId}/shapes`,
    token,
    (page) => ({ items: page.shapes, total: page.total }),
  );

export const createShape = (token: string, boardId: string, body: CreateBoardShape): Promise<BoardShape> =>
  tackApiRequest(`/idea-boards/${boardId}/shapes`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateShape = (token: string, boardId: string, shapeId: string, body: UpdateBoardShape): Promise<BoardShape> => {
  void boardId; // see updateSticky's comment -- shapes are addressed by id alone too
  return tackApiRequest(`/shapes/${shapeId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
};

export const deleteShape = (token: string, boardId: string, shapeId: string): Promise<void> => {
  void boardId;
  return tackApiRequest(`/shapes/${shapeId}`, token, { method: "DELETE" });
};
