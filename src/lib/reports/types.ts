// Derived chart-ready data types produced by compute.ts pure functions.

// ── Sprint ────────────────────────────────────────────────────────────────────

export interface SprintProgressData {
  totalPoints: number;
  donePoints: number;
  pctDone: number;
  daysTotal: number;
  daysRemaining: number;
  trafficLight: "green" | "amber" | "red";
}

export interface BurndownPoint {
  date: string;        // YYYY-MM-DD
  remaining: number;
  ideal: number;
}

export interface VelocityBar {
  sprintName: string;
  sprintId: string;
  delivered: number;
}

export interface CompletionBar {
  sprintName: string;
  sprintId: string;
  planned: number;
  delivered: number;
}

// ── Flow ──────────────────────────────────────────────────────────────────────

export interface CfdPoint {
  date: string;
  "Not Started": number;
  "Ready": number;
  "In Progress": number;
  "On Hold": number;
  "Complete": number;
  "Cancelled": number;
}

export interface ThroughputBar {
  weekStart: string;
  count: number;
}

export interface CycleTimePoint {
  taskId: string;
  taskName: string;
  workflowName: string;
  completedAt: string;
  cycleTimeDays: number;
}

export interface CycleTimeData {
  points: CycleTimePoint[];
  p50: number;
  p85: number;
  p95: number;
}

export interface LeadTimeBin {
  binLabel: string;
  count: number;
}

// ── Process ───────────────────────────────────────────────────────────────────

export interface StepTimingBar {
  stepName: string;
  avgDays: number;
  p85Days: number;
}

export interface FunnelStep {
  stepName: string;
  entered: number;
  completed: number;
}

export interface AgingCell {
  workflowId: string;
  workflowName: string;
  stepName: string;
  daysInCurrentState: number;
}

// ── Team ──────────────────────────────────────────────────────────────────────

export interface TeamLoadBar {
  assigneeId: string;
  assigneeName: string;
  plannedPoints: number;
  deliveredPoints: number;
}

export interface RoleSlice {
  label: string;
  count: number;
}

export interface SparklinePoint {
  weekStart: string;
  count: number;
}

export interface MemberSparkline {
  memberId: string;
  memberName: string;
  points: SparklinePoint[];
}

// ── Ideas ─────────────────────────────────────────────────────────────────────

export interface IdeasFunnelData {
  created: number;
  promoted: number;
  completed: number;
}

export interface IdeaAgeBin {
  binLabel: string;
  count: number;
}
