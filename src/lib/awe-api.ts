// AWE API calls (jobs, workflows, tasks, notes, teams) used by Togra.
// All browser requests go via /api/* rewrite; server-side uses API_URL directly.

import type { Job, JobWithWorkflows, Task, Workflow, WorkflowWithTasks, Note, NoteFolder, TeamSummary, Team, TeamRole, TaskTeamRole } from "./types";

const BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:8085")
    : "/api";

const AUTH_BASE =
  typeof window === "undefined"
    ? (process.env.AUTH_URL ?? "http://localhost:8081")
    : "/auth-api";

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return undefined as T;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  return data as T;
}

async function authApiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    ...init,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return undefined as T;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export const listJobs = (token: string, params?: { team_id?: string }): Promise<Job[]> => {
  const qs = new URLSearchParams();
  if (params?.team_id) qs.set("team_id", params.team_id);
  const query = qs.toString() ? `?${qs}` : "";
  return apiRequest(`/jobs${query}`, token);
};

export const createJob = (
  token: string,
  payload: {
    name: string;
    project_id?: string;
    team_id?: string;
    job_type?: "sprint" | "kanban" | "backlog";
    start_date?: string;
    end_date?: string;
  }
): Promise<Job> =>
  apiRequest("/jobs", token, { method: "POST", body: JSON.stringify(payload) });

export const getJob = (token: string, id: string): Promise<JobWithWorkflows> =>
  apiRequest(`/jobs/${id}`, token);

export const updateJob = (
  token: string,
  id: string,
  patch: { name?: string; status?: string; archived?: boolean; start_date?: string; end_date?: string }
): Promise<Job> =>
  apiRequest(`/jobs/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteJob = (token: string, id: string): Promise<void> =>
  apiRequest(`/jobs/${id}`, token, { method: "DELETE" });

// ── Workflows / Stories ───────────────────────────────────────────────────────

/** List workflows. Pass job_id to get only stories for a specific job (backlog or sprint). */
export const listWorkflows = (token: string, params?: { job_id?: string; team_id?: string }): Promise<Workflow[]> => {
  const qs = new URLSearchParams();
  if (params?.job_id) qs.set("job_id", params.job_id);
  else if (params?.team_id) qs.set("team_id", params.team_id);
  const query = qs.toString() ? `?${qs}` : "";
  return apiRequest(`/workflows${query}`, token);
};

export const getWorkflow = (token: string, id: string): Promise<WorkflowWithTasks> =>
  apiRequest(`/workflows/${id}`, token);

export const createWorkflow = (
  token: string,
  payload: {
    name: string;
    job_id?: string;
    is_template?: boolean;
    description?: string;
    story_points?: number;
    sort_order?: number;
    is_shared?: boolean;
  }
): Promise<Workflow> =>
  apiRequest("/workflows", token, { method: "POST", body: JSON.stringify(payload) });

/** Update a workflow. Pass job_id to move a story between jobs (backlog ↔ sprint). */
export const updateWorkflow = (
  token: string,
  id: string,
  patch: {
    name?: string;
    description?: string;
    status?: string;
    job_id?: string;
    story_points?: number;
    sort_order?: number;
    is_shared?: boolean;
    is_template?: boolean;
  }
): Promise<Workflow> =>
  apiRequest(`/workflows/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteWorkflow = (token: string, id: string): Promise<void> =>
  apiRequest(`/workflows/${id}`, token, { method: "DELETE" });

/** Clone a workflow template into a job. Returns the new workflow. */
export const cloneWorkflowFromTemplate = (
  token: string,
  jobId: string,
  templateId: string
): Promise<Workflow> =>
  apiRequest(`/jobs/${jobId}/workflows/from-template/${templateId}`, token, { method: "POST" });

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const listTasks = (token: string, workflowId: string): Promise<Task[]> =>
  apiRequest(`/tasks?workflow_id=${workflowId}`, token);

export const createTask = (
  token: string,
  payload: { name: string; workflow_id: string; description?: string }
): Promise<Task> =>
  apiRequest("/tasks", token, { method: "POST", body: JSON.stringify(payload) });

export const updateTask = (
  token: string,
  id: string,
  patch: { name?: string; status?: string; description?: string; assigned_to?: string | null }
): Promise<Task> =>
  apiRequest(`/tasks/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteTask = (token: string, id: string): Promise<void> =>
  apiRequest(`/tasks/${id}`, token, { method: "DELETE" });

export const listTaskTeamRoles = (token: string, taskId: string): Promise<TaskTeamRole[]> =>
  apiRequest(`/tasks/${taskId}/team-roles`, token);

export const assignTaskTeamRole = (token: string, taskId: string, teamRoleId: string): Promise<TaskTeamRole> =>
  apiRequest(`/tasks/${taskId}/team-roles`, token, {
    method: "POST",
    body: JSON.stringify({ team_role_id: teamRoleId }),
  });

export const removeTaskTeamRole = (token: string, taskId: string, teamRoleId: string): Promise<void> =>
  apiRequest(`/tasks/${taskId}/team-roles/${teamRoleId}`, token, { method: "DELETE" });

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

// ── Note folders ──────────────────────────────────────────────────────────────

export const listNoteFolders = (token: string): Promise<NoteFolder[]> =>
  apiRequest("/note-folders", token);

export const createNoteFolder = (token: string, name: string): Promise<NoteFolder> =>
  apiRequest("/note-folders", token, { method: "POST", body: JSON.stringify({ name }) });

export const updateNoteFolder = (token: string, id: string, name: string): Promise<NoteFolder> =>
  apiRequest(`/note-folders/${id}`, token, { method: "PUT", body: JSON.stringify({ name }) });

export const deleteNoteFolder = (token: string, id: string): Promise<void> =>
  apiRequest(`/note-folders/${id}`, token, { method: "DELETE" });

// ── Teams (UUM) ───────────────────────────────────────────────────────────────

export const getMyTeams = (token: string): Promise<TeamSummary[]> =>
  authApiRequest("/teams", token);

export const getTeam = (token: string, id: string): Promise<Team> =>
  authApiRequest(`/teams/${id}`, token);

export const listTeamRoles = (token: string, teamId: string): Promise<TeamRole[]> =>
  authApiRequest(`/teams/${teamId}/roles`, token);
