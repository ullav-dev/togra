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
  /** Short unique code (e.g. "P1"), used as the prefix for task/workflow references. */
  project_code: string;
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
  /** The linked project's code, if any — shared by every workflow in `workflows`. */
  project_code: string | null;
}

/** First-task allocation summary for a workflow in a Kanban job. */
export interface WorkflowAllocation {
  workflow_id: string;
  /** The is_start task ID, if one exists. */
  start_task_id: string | null;
  /** Direct user assignee on the start task. */
  assigned_to: string | null;
  /** Team role IDs assigned to the start task. */
  team_role_ids: string[];
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
  /** Cunav ticket fields — present when ticket_type is set. */
  ticket_type: string | null;
  ticket_number: number | null;
  priority: string | null;
  reporter_id: string | null;
  /** Sequence number within the owning project's workflow numbering (e.g. `4` in "P1-W0004"). Null for templates/jobless workflows. */
  workflow_number: number | null;
}

export interface WorkflowWithTasks extends Workflow {
  tasks: Task[];
  links: TaskLink[];
  /** The owning project's code, if the workflow's job is linked to one. */
  project_code: string | null;
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
  effort: number | null;
  decision_outcome: string | null;
  decision_input_port: string | null;
  /** `"none"` (default), `"low"`, `"medium"`, `"high"`, or `"critical"`. */
  priority: string;
  /** Optional point in time the task is due. */
  due_time: string | null;
  /** Sequence number within the owning project's task numbering (e.g. `4` in "P1-0004"). Null for templates/jobless workflows. */
  task_number: number | null;
}

export interface TaskLink {
  from_task_id: string;
  to_task_id: string;
  branch_label: string | null;
}

export interface WorkItem {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  effort: number | null;
  is_start: boolean;
  is_end: boolean;
  decision_input_port: string | null;
  is_locked: boolean;
  assigned_to: string | null;
  team_id: string | null;
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchTaskResult {
  label: string;
  task: Task;
}

export interface InstantiateWorkItemResponse {
  primary_task: Task;
  branch_tasks: BranchTaskResult[];
}

export interface TaskTeamRole {
  task_id: string;
  team_role_id: string;
  assigned_at: string;
}

export type ScriptType = "webhook" | "shell" | "python" | "mcp_tool";

export type PortDirection = "input" | "output";
export type PortValueType = "string" | "number" | "boolean" | "json" | "file" | "dam_asset";

export interface TaskPortSpec {
  id: string;
  task_id: string;
  direction: PortDirection;
  name: string;
  value_type: PortValueType;
  required: boolean;
  description: string | null;
  sort_order: number;
}

export interface TaskScript {
  id: string;
  task_id: string;
  script_type: ScriptType;
  endpoint: string | null;
  script_body: string | null;
  timeout_secs: number;
  retry_limit: number;
  execution_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionProfile {
  id: string;
  name: string;
  image: string;
  description: string | null;
  cpu_request: string;
  cpu_limit: string;
  memory_request: string;
  memory_limit: string;
  image_pull_policy: string;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export type NoteEntityType = "task" | "workflow" | "job" | "project";

export interface NoteFolder {
  id: string;
  name: string;
  folder_type: string;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string;
  created_at: string;
}

export interface IdeaBoard {
  id: string;
  name: string;
  project_id: string;
  created_by: string;
  created_at: string;
}

export type StickyColor = "yellow" | "pink" | "blue" | "green" | "purple" | "orange";
export type Port = "top" | "right" | "bottom" | "left";

// Re-export from diagram-shapes package so consumers can import from one place
export type { BoardShape, ShapeType } from "@ullav-dev/diagram-shapes";

export interface StickyNote {
  id: string;
  title: string;
  body: string | null;
  color: StickyColor;
  x: number;
  y: number;
  width: number;
  height: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Soft reference to a backlog story. Set when the sticky was promoted to a story. */
  workflow_id: string | null;
}

export interface StickyOrigin {
  board_id: string;
  board_name: string;
  sticky: StickyNote;
}

export interface NoteLink {
  id: string;
  from_note_id: string | null;
  to_note_id: string | null;
  from_shape_id: string | null;
  to_shape_id: string | null;
  label: string | null;
  from_port: Port | null;
  to_port: Port | null;
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

// ── Reporting ─────────────────────────────────────────────────────────────────

export interface TaskStateHistoryEntry {
  id: string;
  transitioned_at: string;
  task_id: string | null;
  task_name: string;
  workflow_id: string | null;
  workflow_name: string;
  job_id: string;
  job_name: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_type: string;
  propagation_depth: number | null;
  metadata: Record<string, unknown> | null;
}

export type ReportInterval = 30 | 60 | 300 | 900;

export type ReportId =
  | "sprint_progress_gauge"
  | "burndown_chart"
  | "velocity_chart"
  | "sprint_completion_rate"
  | "cumulative_flow_diagram"
  | "throughput_chart"
  | "cycle_time_scatter"
  | "lead_time_distribution"
  | "workflow_step_timing"
  | "workflow_funnel"
  | "story_aging_heatmap"
  | "team_load_chart"
  | "task_role_distribution"
  | "member_throughput_sparklines"
  | "ideas_funnel"
  | "idea_age_distribution";

export type PresetId =
  | "sprint_overview"
  | "flow_health"
  | "process_insights"
  | "team_capacity"
  | "ideas_pipeline"
  | "live_sprint_room";

export interface DashboardConfig {
  version: 1;
  enabledReportIds: ReportId[];
  presetId?: PresetId;
}
