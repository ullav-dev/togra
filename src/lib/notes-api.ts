// Notes API — Notes, NoteFolder, IdeaBoard, StickyNote, NoteLink.
// Intentionally separate from awe-api.ts so this module can be extracted
// to a dedicated Notes service in future without touching AWE code.

import type {
  Note,
  NoteFolder,
  IdeaBoard,
  StickyNote,
  StickyOrigin,
  NoteLink,
} from "./types";
import type { BoardShape, CreateBoardShape, UpdateBoardShape } from "@ullav-dev/diagram-shapes";

const BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:8085")
    : "/api";

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

// ── Notes ─────────────────────────────────────────────────────────────────────

export const listNotes = (token: string, entityType: string, entityId: string): Promise<Note[]> =>
  apiRequest(`/notes?entity_type=${entityType}&entity_id=${entityId}`, token);

export const createNote = (
  token: string,
  payload: { entity_type: string; entity_id: string; title: string; body?: string; is_shared?: boolean }
): Promise<Note> =>
  apiRequest("/notes", token, { method: "POST", body: JSON.stringify(payload) });

export const updateNote = (
  token: string,
  id: string,
  patch: { title?: string; body?: string; is_shared?: boolean }
): Promise<Note> =>
  apiRequest(`/notes/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteNote = (token: string, id: string): Promise<void> =>
  apiRequest(`/notes/${id}`, token, { method: "DELETE" });

export const listNoteReplies = (token: string, noteId: string): Promise<Note[]> =>
  apiRequest(`/notes/${noteId}/replies`, token);

export const createNoteReply = (token: string, noteId: string, body: string): Promise<Note> =>
  apiRequest(`/notes/${noteId}/replies`, token, { method: "POST", body: JSON.stringify({ body }) });

export const moveNote = (token: string, noteId: string, folderId: string | null): Promise<Note> =>
  apiRequest(`/notes/${noteId}/folder`, token, { method: "PUT", body: JSON.stringify({ folder_id: folderId }) });

// ── Note Folders (general) ─────────────────────────────────────────────────────

export const listNoteFolders = (token: string): Promise<NoteFolder[]> =>
  apiRequest("/note-folders", token);

export const createNoteFolder = (token: string, name: string): Promise<NoteFolder> =>
  apiRequest("/note-folders", token, { method: "POST", body: JSON.stringify({ name }) });

export const updateNoteFolder = (token: string, id: string, name: string): Promise<NoteFolder> =>
  apiRequest(`/note-folders/${id}`, token, { method: "PUT", body: JSON.stringify({ name }) });

export const deleteNoteFolder = (token: string, id: string): Promise<void> =>
  apiRequest(`/note-folders/${id}`, token, { method: "DELETE" });

// ── Ideas Boards ───────────────────────────────────────────────────────────────

export const listIdeaBoards = (token: string, projectId: string): Promise<IdeaBoard[]> =>
  apiRequest(`/projects/${projectId}/idea-boards`, token);

export const createIdeaBoard = (token: string, projectId: string, name: string): Promise<IdeaBoard> =>
  apiRequest(`/projects/${projectId}/idea-boards`, token, { method: "POST", body: JSON.stringify({ name }) });

export const getIdeaBoard = (token: string, boardId: string): Promise<IdeaBoard> =>
  apiRequest(`/idea-boards/${boardId}`, token);

export const updateIdeaBoard = (token: string, boardId: string, name: string): Promise<IdeaBoard> =>
  apiRequest(`/idea-boards/${boardId}`, token, { method: "PUT", body: JSON.stringify({ name }) });

export const deleteIdeaBoard = (token: string, boardId: string): Promise<void> =>
  apiRequest(`/idea-boards/${boardId}`, token, { method: "DELETE" });

// ── Stickies ───────────────────────────────────────────────────────────────────

export const listStickies = (token: string, boardId: string): Promise<StickyNote[]> =>
  apiRequest(`/idea-boards/${boardId}/stickies`, token);

export const createSticky = (
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
): Promise<StickyNote> =>
  apiRequest(`/idea-boards/${boardId}/stickies`, token, { method: "POST", body: JSON.stringify(payload) });

export const updateSticky = (
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
): Promise<StickyNote> =>
  apiRequest(`/idea-boards/${boardId}/stickies/${noteId}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const getStickyByWorkflow = (token: string, workflowId: string): Promise<StickyOrigin> =>
  apiRequest(`/stickies/by-workflow/${workflowId}`, token);

export const deleteSticky = (token: string, boardId: string, noteId: string): Promise<void> =>
  apiRequest(`/idea-boards/${boardId}/stickies/${noteId}`, token, { method: "DELETE" });

// ── Note Links ─────────────────────────────────────────────────────────────────

export const listNoteLinks = (token: string, boardId: string): Promise<NoteLink[]> =>
  apiRequest(`/idea-boards/${boardId}/links`, token);

export const createNoteLink = (
  token: string,
  boardId: string,
  fromNoteId: string,
  toNoteId: string,
  label?: string,
  fromPort?: string,
  toPort?: string,
): Promise<NoteLink> =>
  apiRequest(`/idea-boards/${boardId}/links`, token, {
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
  apiRequest(`/idea-boards/${boardId}/links`, token, {
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
  apiRequest(`/note-links/${linkId}`, token, { method: "PUT", body: JSON.stringify({ label }) });

export const deleteNoteLink = (token: string, linkId: string): Promise<void> =>
  apiRequest(`/note-links/${linkId}`, token, { method: "DELETE" });

// ── Board Shapes ──────────────────────────────────────────────────────────────

export const listShapes = (token: string, boardId: string): Promise<BoardShape[]> =>
  apiRequest(`/idea-boards/${boardId}/shapes`, token);

export const createShape = (token: string, boardId: string, body: CreateBoardShape): Promise<BoardShape> =>
  apiRequest(`/idea-boards/${boardId}/shapes`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateShape = (token: string, boardId: string, shapeId: string, body: UpdateBoardShape): Promise<BoardShape> =>
  apiRequest(`/idea-boards/${boardId}/shapes/${shapeId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteShape = (token: string, boardId: string, shapeId: string): Promise<void> =>
  apiRequest(`/idea-boards/${boardId}/shapes/${shapeId}`, token, { method: "DELETE" });
