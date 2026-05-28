// AWE API calls (jobs, workflows, tasks, notes) used by Togra.
// All browser requests go via /api/* rewrite; server-side uses API_URL directly.

import type { Job, JobWithWorkflows, Task, Workflow, Note, TeamSummary, Team, TeamRole } from "./types";

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

export const listJobs = (token: string, params?: { team_id?: string; project_id?: string }): Promise<Job[]> => {
  const qs = new URLSearchParams();
  if (params?.team_id) qs.set("team_id", params.team_id);
  const query = qs.toString() ? `?${qs}` : "";
  return apiRequest(`/jobs${query}`, token);
};

export const createJob = (
  token: string,
  payload: { name: string; project_id?: string; team_id?: string; job_type?: "sprint" | "kanban" }
): Promise<Job> =>
  apiRequest("/jobs", token, { method: "POST", body: JSON.stringify(payload) });

export const getJob = (token: string, id: string): Promise<JobWithWorkflows> =>
  apiRequest(`/jobs/${id}`, token);

export const updateJob = (
  token: string,
  id: string,
  patch: { name?: string; status?: string; archived?: boolean }
): Promise<Job> =>
  apiRequest(`/jobs/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteJob = (token: string, id: string): Promise<void> =>
  apiRequest(`/jobs/${id}`, token, { method: "DELETE" });

// ── Workflows ─────────────────────────────────────────────────────────────────

export const listWorkflows = (token: string, jobId?: string): Promise<Workflow[]> =>
  apiRequest(`/workflows${jobId ? `?job_id=${jobId}` : ""}`, token);

// ── Tasks / Stories ───────────────────────────────────────────────────────────

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

// ── Teams (UUM) ───────────────────────────────────────────────────────────────

export const getMyTeams = (token: string): Promise<TeamSummary[]> =>
  authApiRequest("/teams", token);

export const getTeam = (token: string, id: string): Promise<Team> =>
  authApiRequest(`/teams/${id}`, token);

export const listTeamRoles = (token: string, teamId: string): Promise<TeamRole[]> =>
  authApiRequest(`/teams/${teamId}/roles`, token);
