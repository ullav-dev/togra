// ── Team types (ullav-user-management) ────────────────────────────────────────

export interface TeamUserRef {
  id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface TeamRole {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user: TeamUserRef;
  status: "invited" | "active" | "inactive";
  role: "owner" | "leader" | "member";
  team_roles: TeamRole[];
  invited_at: string;
  joined_at: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  avatar_url: string | null;
  owner: TeamUserRef;
  leader: TeamUserRef;
  members: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner: TeamUserRef;
  leader: TeamUserRef;
  member_count: number;
  created_at: string;
  updated_at: string;
}

// ── Shared AWE status types ───────────────────────────────────────────────────

export type Status = "Not Started" | "Ready" | "In Progress" | "On Hold" | "Complete" | "Cancelled";
export type ScheduleStatus = "N/A" | "On Time" | "At Risk" | "Late";

// ── Projects (Togra) ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  team_id: string | null;
  project_manager_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithJobs extends Project {
  jobs: Job[];
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  name: string;
  status: Status;
  schedule_status: ScheduleStatus;
  team_id: string | null;
  project_id: string | null;
  /** `"sprint"`, `"kanban"`, `"backlog"`, or null for legacy jobs. */
  job_type: "sprint" | "kanban" | "backlog" | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  /** ISO date string (YYYY-MM-DD). Relevant for sprint jobs. */
  start_date: string | null;
  end_date: string | null;
}

export interface JobWithWorkflows extends Job {
  workflows: Workflow[];
}

// ── Workflows / Stories ───────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  description: string | null;
  status: Status;
  schedule_status: ScheduleStatus;
  job_id: string | null;
  team_id: string | null;
  is_shared: boolean;
  /** Display order within the parent job. */
  sort_order: number | null;
  /** Story point estimate. */
  story_points: number | null;
}

export interface WorkflowWithTasks extends Workflow {
  tasks: Task[];
  links: TaskLink[];
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export type TaskType = "standard" | "decision" | "automated" | "loop_block";

export interface Task {
  id: string;
  name: string;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  description: string | null;
  status: Status;
  schedule_status: ScheduleStatus;
  workflow_id: string;
  is_start: boolean;
  is_end: boolean;
  task_type: TaskType;
  assigned_to: string | null;
  start_time: string | null;
  end_time: string | null;
  canvas_x: number | null;
  canvas_y: number | null;
}

export interface TaskLink {
  from_task_id: string;
  to_task_id: string;
  branch_label: string | null;
}

export interface TaskTeamRole {
  task_id: string;
  team_role_id: string;
  assigned_at: string;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export type NoteEntityType = "task" | "workflow" | "job" | "project";

export interface NoteFolder {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface Note {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string | null;
  is_shared: boolean;
  parent_id: string | null;
  folder_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
