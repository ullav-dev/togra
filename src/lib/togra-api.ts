// Togra-specific API calls against awe-server's /projects endpoints.
// In the browser all requests go via /api/* Next.js rewrite to avoid CORS.

import type { Project, ProjectWithJobs, Job } from "./types";
import { createJob } from "./awe-api";

const BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:8085")
    : "/api";

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

// ── Projects ──────────────────────────────────────────────────────────────────

export const listProjects = (token: string, teamId?: string): Promise<Project[]> =>
  apiRequest(`/projects${teamId ? `?team_id=${teamId}` : ""}`, token);

/** Create a project, then immediately create its Backlog job. Returns both. */
export async function createProjectWithBacklog(
  token: string,
  payload: { name: string; description?: string; team_id?: string; project_manager_id?: string }
): Promise<{ project: Project; backlogJob: Job }> {
  const project = await apiRequest<Project>("/projects", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const backlogJob = await createJob(token, {
    name: "Backlog",
    project_id: project.id,
    team_id: payload.team_id,
    job_type: "backlog",
  });
  return { project, backlogJob };
}

export const getProject = (token: string, id: string): Promise<ProjectWithJobs> =>
  apiRequest(`/projects/${id}`, token);

export const updateProject = (
  token: string,
  id: string,
  patch: { name?: string; description?: string; status?: string; project_manager_id?: string }
): Promise<Project> =>
  apiRequest(`/projects/${id}`, token, { method: "PUT", body: JSON.stringify(patch) });

export const deleteProject = (token: string, id: string): Promise<void> =>
  apiRequest(`/projects/${id}`, token, { method: "DELETE" });
