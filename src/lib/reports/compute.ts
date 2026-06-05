// Pure data-transform functions for the reporting dashboard.
// No API calls. No side effects. All inputs are typed domain objects.

import type { Job, Workflow, Task, TeamMember, TaskStateHistoryEntry, StickyNote } from "../types";
import type {
  SprintProgressData, BurndownPoint, VelocityBar, CompletionBar,
  CfdPoint, ThroughputBar, CycleTimePoint, CycleTimeData, LeadTimeBin,
  StepTimingBar, FunnelStep, AgingCell,
  TeamLoadBar, RoleSlice, SparklinePoint, MemberSparkline,
  IdeasFunnelData, IdeaAgeBin,
} from "./types";

const MS_PER_DAY = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function toDate(s: string): Date {
  return new Date(s);
}

/** ISO YYYY-MM-DD string for a Date */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add N days to a Date */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Monday of the ISO week containing d */
function weekStart(d: Date): string {
  const day = d.getUTCDay();
  const monday = new Date(d.getTime() - ((day === 0 ? 6 : day - 1) * MS_PER_DAY));
  return toDateStr(monday);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Sprint ────────────────────────────────────────────────────────────────────

export function computeSprintProgress(
  workflows: Workflow[],
  sprint: Job,
  today: Date
): SprintProgressData {
  const totalPoints = workflows.reduce((s, w) => s + (w.story_points ?? 0), 0);
  const donePoints = workflows
    .filter((w) => w.status === "Complete")
    .reduce((s, w) => s + (w.story_points ?? 0), 0);
  const pctDone = totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);

  const start = sprint.start_date ? toDate(sprint.start_date) : today;
  const end = sprint.end_date ? toDate(sprint.end_date) : today;
  const daysTotal = Math.max(1, daysBetween(start, end));
  const daysRemaining = Math.max(0, daysBetween(today, end));
  const daysElapsed = daysTotal - daysRemaining;
  const expectedPct = Math.round((daysElapsed / daysTotal) * 100);

  let trafficLight: SprintProgressData["trafficLight"];
  if (pctDone >= expectedPct) {
    trafficLight = "green";
  } else if (pctDone >= expectedPct * 0.75) {
    trafficLight = "amber";
  } else {
    trafficLight = "red";
  }

  return { totalPoints, donePoints, pctDone, daysTotal, daysRemaining, trafficLight };
}

/**
 * Reconstruct daily burndown from task history.
 * A story is "complete" when its is_end task transitions to Complete.
 * Fallback: all tasks Complete or Cancelled.
 */
export function computeBurndownSeries(
  sprint: Job,
  workflows: Workflow[],
  history: TaskStateHistoryEntry[],
  taskMeta: Record<string, { is_end: boolean; workflow_id: string }>
): BurndownPoint[] {
  if (!sprint.start_date || !sprint.end_date) return [];

  const start = toDate(sprint.start_date);
  const end = toDate(sprint.end_date);
  const daysTotal = Math.max(1, daysBetween(start, end));
  const totalPoints = workflows.reduce((s, w) => s + (w.story_points ?? 0), 0);

  // Build workflowId → completed_at map from history
  // Group relevant "Complete" transitions by workflow
  const completionsByWorkflow: Record<string, Date[]> = {};
  for (const entry of history) {
    if (entry.to_status !== "Complete" || !entry.task_id) continue;
    const meta = taskMeta[entry.task_id];
    if (!meta) continue;
    const wfId = meta.workflow_id;
    if (!completionsByWorkflow[wfId]) completionsByWorkflow[wfId] = [];
    completionsByWorkflow[wfId].push(toDate(entry.transitioned_at));
  }

  // Determine completion timestamp per workflow
  const workflowCompletedAt: Record<string, Date> = {};
  for (const wf of workflows) {
    const completions = completionsByWorkflow[wf.id] ?? [];
    if (completions.length === 0) continue;

    // Check if there is an is_end task completion
    const endTaskCompletions = history.filter(
      (e) => e.to_status === "Complete" && e.task_id && taskMeta[e.task_id]?.is_end && taskMeta[e.task_id]?.workflow_id === wf.id
    );
    if (endTaskCompletions.length > 0) {
      const timestamps = endTaskCompletions.map((e) => toDate(e.transitioned_at));
      workflowCompletedAt[wf.id] = new Date(Math.min(...timestamps.map((d) => d.getTime())));
    } else {
      // Fallback: last completion across all tasks in this workflow
      const latest = new Date(Math.max(...completions.map((d) => d.getTime())));
      workflowCompletedAt[wf.id] = latest;
    }
  }

  const points: BurndownPoint[] = [];
  for (let i = 0; i <= daysTotal; i++) {
    const dayEnd = addDays(start, i);
    const dayEndStr = toDateStr(dayEnd);
    const remaining = workflows
      .filter((w) => {
        const completedAt = workflowCompletedAt[w.id];
        return !completedAt || toDateStr(completedAt) > dayEndStr;
      })
      .reduce((s, w) => s + (w.story_points ?? 0), 0);
    const ideal = Math.round(totalPoints * (daysTotal - i) / daysTotal);
    points.push({ date: toDateStr(dayEnd), remaining, ideal });
  }
  return points;
}

export function computeVelocitySeries(
  sprints: Job[],
  workflowsBySprint: Record<string, Workflow[]>
): { bars: VelocityBar[]; rollingAvg: number[] } {
  const bars: VelocityBar[] = sprints.map((s) => {
    const wfs = workflowsBySprint[s.id] ?? [];
    const delivered = wfs
      .filter((w) => w.status === "Complete")
      .reduce((sum, w) => sum + (w.story_points ?? 0), 0);
    return { sprintName: s.name, sprintId: s.id, delivered };
  });

  const WINDOW = 3;
  const rollingAvg = bars.map((_, i) => {
    const slice = bars.slice(Math.max(0, i - WINDOW + 1), i + 1);
    return Math.round(slice.reduce((s, b) => s + b.delivered, 0) / slice.length);
  });

  return { bars, rollingAvg };
}

export function computeSprintCompletionRate(
  sprints: Job[],
  workflowsBySprint: Record<string, Workflow[]>
): CompletionBar[] {
  return sprints.map((s) => {
    const wfs = workflowsBySprint[s.id] ?? [];
    return {
      sprintName: s.name,
      sprintId: s.id,
      planned: wfs.length,
      delivered: wfs.filter((w) => w.status === "Complete").length,
    };
  });
}

// ── Flow & Throughput ─────────────────────────────────────────────────────────

const ALL_STATUSES = ["Not Started", "Ready", "In Progress", "On Hold", "Complete", "Cancelled"] as const;

/**
 * Cumulative Flow Diagram — task-level, daily granularity.
 * Starting snapshot: tasks in currentTasks with no in-window transition are
 * seeded at their current status for the entire window.
 */
export function computeCfdSeries(
  sprint: Job,
  history: TaskStateHistoryEntry[],
  currentTasks: Task[]
): CfdPoint[] {
  if (!sprint.start_date || !sprint.end_date) return [];

  const start = toDate(sprint.start_date);
  const end = toDate(sprint.end_date);
  const daysTotal = daysBetween(start, end);

  // Build per-task transition list, sorted by time
  const taskTransitions: Record<string, { at: Date; toStatus: string }[]> = {};
  for (const entry of history) {
    if (!entry.task_id) continue;
    if (!taskTransitions[entry.task_id]) taskTransitions[entry.task_id] = [];
    taskTransitions[entry.task_id].push({ at: toDate(entry.transitioned_at), toStatus: entry.to_status });
  }
  for (const id in taskTransitions) {
    taskTransitions[id].sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // Determine each task's status at sprint start
  const startStatus: Record<string, string> = {};
  for (const task of currentTasks) {
    const transitions = taskTransitions[task.id] ?? [];
    if (transitions.length === 0) {
      startStatus[task.id] = task.status;
    } else {
      // Status before first transition = from_status of first transition in history
      const firstEntry = history
        .filter((e) => e.task_id === task.id)
        .sort((a, b) => toDate(a.transitioned_at).getTime() - toDate(b.transitioned_at).getTime())[0];
      startStatus[task.id] = firstEntry?.from_status ?? task.status;
    }
  }

  const points: CfdPoint[] = [];
  for (let i = 0; i <= daysTotal; i++) {
    const dayEnd = addDays(start, i);
    const counts: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));

    for (const task of currentTasks) {
      // Find current status at dayEnd by replaying transitions
      let status = startStatus[task.id] ?? "Not Started";
      const dayEndStr = toDateStr(dayEnd);
      for (const t of taskTransitions[task.id] ?? []) {
        if (toDateStr(t.at) <= dayEndStr) status = t.toStatus;
        else break;
      }
      if (status in counts) counts[status]++;
    }

    points.push({
      date: toDateStr(dayEnd),
      "Not Started": counts["Not Started"],
      "Ready": counts["Ready"],
      "In Progress": counts["In Progress"],
      "On Hold": counts["On Hold"],
      "Complete": counts["Complete"],
      "Cancelled": counts["Cancelled"],
    });
  }
  return points;
}

export function computeThroughputSeries(
  history: TaskStateHistoryEntry[],
  since: Date,
  until: Date
): ThroughputBar[] {
  const counts: Record<string, number> = {};
  for (const entry of history) {
    if (entry.to_status !== "Complete") continue;
    const at = toDate(entry.transitioned_at);
    if (at < since || at > until) continue;
    const ws = weekStart(at);
    counts[ws] = (counts[ws] ?? 0) + 1;
  }

  // Fill all weeks in range
  const result: ThroughputBar[] = [];
  let cursor = new Date(since);
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7)); // Monday
  while (cursor <= until) {
    const ws = toDateStr(cursor);
    result.push({ weekStart: ws, count: counts[ws] ?? 0 });
    cursor = addDays(cursor, 7);
  }
  return result;
}

export function computeCycleTimeScatter(
  history: TaskStateHistoryEntry[]
): CycleTimeData {
  // Group transitions by task_id
  const byTask: Record<string, TaskStateHistoryEntry[]> = {};
  for (const e of history) {
    if (!e.task_id) continue;
    if (!byTask[e.task_id]) byTask[e.task_id] = [];
    byTask[e.task_id].push(e);
  }

  const points: CycleTimePoint[] = [];
  for (const [taskId, entries] of Object.entries(byTask)) {
    const sorted = [...entries].sort((a, b) => toDate(a.transitioned_at).getTime() - toDate(b.transitioned_at).getTime());
    const firstActive = sorted.find((e) => e.to_status === "In Progress");
    const completion = [...sorted].reverse().find((e) => e.to_status === "Complete");
    if (!firstActive || !completion) continue;
    const start = toDate(firstActive.transitioned_at);
    const end = toDate(completion.transitioned_at);
    const cycleTimeDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
    if (cycleTimeDays < 0) continue;
    points.push({
      taskId,
      taskName: entries[0].task_name,
      workflowName: entries[0].workflow_name,
      completedAt: completion.transitioned_at,
      cycleTimeDays: Math.round(cycleTimeDays * 100) / 100,
    });
  }

  const sorted = [...points].map((p) => p.cycleTimeDays).sort((a, b) => a - b);
  return {
    points,
    p50: Math.round(percentile(sorted, 50) * 100) / 100,
    p85: Math.round(percentile(sorted, 85) * 100) / 100,
    p95: Math.round(percentile(sorted, 95) * 100) / 100,
  };
}

export function computeLeadTimeDistribution(
  history: TaskStateHistoryEntry[],
  currentTasks: Task[],
  binDays = 7
): LeadTimeBin[] {
  const createdAt: Record<string, Date> = {};
  for (const t of currentTasks) createdAt[t.id] = toDate(t.created_at);

  const leadTimes: number[] = [];
  const completed: Record<string, Date> = {};
  for (const e of history) {
    if (e.to_status !== "Complete" || !e.task_id) continue;
    const existing = completed[e.task_id];
    const at = toDate(e.transitioned_at);
    if (!existing || at > existing) completed[e.task_id] = at;
  }

  for (const [taskId, completedAt] of Object.entries(completed)) {
    const created = createdAt[taskId];
    if (!created) continue;
    const days = (completedAt.getTime() - created.getTime()) / MS_PER_DAY;
    if (days >= 0) leadTimes.push(days);
  }

  if (leadTimes.length === 0) return [];

  const maxDays = Math.ceil(Math.max(...leadTimes));
  const bins: LeadTimeBin[] = [];
  for (let lo = 0; lo < maxDays; lo += binDays) {
    const hi = lo + binDays;
    const count = leadTimes.filter((d) => d >= lo && d < hi).length;
    bins.push({ binLabel: `${lo}–${hi}d`, count });
  }
  return bins;
}

// ── Workflow Process ──────────────────────────────────────────────────────────

export function computeWorkflowStepTiming(
  history: TaskStateHistoryEntry[]
): StepTimingBar[] {
  // Group by task_name (= workflow step name)
  const byStep: Record<string, number[]> = {};

  const byTask: Record<string, TaskStateHistoryEntry[]> = {};
  for (const e of history) {
    if (!e.task_id) continue;
    if (!byTask[e.task_id]) byTask[e.task_id] = [];
    byTask[e.task_id].push(e);
  }

  for (const entries of Object.values(byTask)) {
    const stepName = entries[0].task_name;
    const sorted = [...entries].sort((a, b) => toDate(a.transitioned_at).getTime() - toDate(b.transitioned_at).getTime());
    // Time from first "In Progress" to "Complete"
    const firstActive = sorted.find((e) => e.to_status === "In Progress");
    const completion = [...sorted].reverse().find((e) => e.to_status === "Complete");
    if (!firstActive || !completion) continue;
    const days = (toDate(completion.transitioned_at).getTime() - toDate(firstActive.transitioned_at).getTime()) / MS_PER_DAY;
    if (days < 0) continue;
    if (!byStep[stepName]) byStep[stepName] = [];
    byStep[stepName].push(days);
  }

  return Object.entries(byStep).map(([stepName, times]) => {
    const sorted = [...times].sort((a, b) => a - b);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return {
      stepName,
      avgDays: Math.round(avg * 100) / 100,
      p85Days: Math.round(percentile(sorted, 85) * 100) / 100,
    };
  });
}

export function computeWorkflowFunnel(
  history: TaskStateHistoryEntry[]
): FunnelStep[] {
  const byStep: Record<string, { entered: Set<string>; completed: Set<string> }> = {};

  for (const e of history) {
    if (!e.task_id) continue;
    const step = e.task_name;
    if (!byStep[step]) byStep[step] = { entered: new Set(), completed: new Set() };
    if (e.to_status === "In Progress") byStep[step].entered.add(e.task_id);
    if (e.to_status === "Complete") byStep[step].completed.add(e.task_id);
  }

  return Object.entries(byStep).map(([stepName, { entered, completed }]) => ({
    stepName,
    entered: entered.size,
    completed: completed.size,
  }));
}

export function computeStoryAgingHeatmap(
  workflows: Workflow[],
  history: TaskStateHistoryEntry[],
  today: Date
): AgingCell[] {
  // Find the most recent transition timestamp per workflow from history
  const lastTransitionByWorkflow: Record<string, Date> = {};
  for (const e of history) {
    if (!e.workflow_id) continue;
    const existing = lastTransitionByWorkflow[e.workflow_id];
    const at = toDate(e.transitioned_at);
    if (!existing || at > existing) lastTransitionByWorkflow[e.workflow_id] = at;
  }

  return workflows
    .filter((w) => w.status !== "Complete" && w.status !== "Cancelled")
    .map((w) => {
      const lastTransition = lastTransitionByWorkflow[w.id] ?? toDate(w.created_at);
      const daysInCurrentState = Math.max(0, Math.floor((today.getTime() - lastTransition.getTime()) / MS_PER_DAY));
      return {
        workflowId: w.id,
        workflowName: w.name,
        stepName: w.status,
        daysInCurrentState,
      };
    });
}

// ── Team & Capacity ───────────────────────────────────────────────────────────

export function computeTeamLoad(
  workflows: Workflow[],
  currentTasks: Task[],
  members: TeamMember[]
): TeamLoadBar[] {
  // Build map: workflowId → story_points
  const pointsByWorkflow: Record<string, number> = {};
  for (const w of workflows) pointsByWorkflow[w.id] = w.story_points ?? 0;

  // Build map: userId → Set<workflowId> that have at least one assigned task
  const assignedWorkflows: Record<string, Set<string>> = {};
  const completedWorkflows: Record<string, Set<string>> = {};

  for (const task of currentTasks) {
    const uid = task.assigned_to;
    if (!uid) continue;
    if (!assignedWorkflows[uid]) assignedWorkflows[uid] = new Set();
    assignedWorkflows[uid].add(task.workflow_id);

    const wf = workflows.find((w) => w.id === task.workflow_id);
    if (wf?.status === "Complete") {
      if (!completedWorkflows[uid]) completedWorkflows[uid] = new Set();
      completedWorkflows[uid].add(task.workflow_id);
    }
  }

  return members.map((m) => {
    const uid = m.user.id;
    const planned = [...(assignedWorkflows[uid] ?? [])].reduce((s, wfId) => s + (pointsByWorkflow[wfId] ?? 0), 0);
    const delivered = [...(completedWorkflows[uid] ?? [])].reduce((s, wfId) => s + (pointsByWorkflow[wfId] ?? 0), 0);
    return {
      assigneeId: uid,
      assigneeName: `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username,
      plannedPoints: planned,
      deliveredPoints: delivered,
    };
  });
}

export function computeTaskRoleDistribution(
  currentTasks: Task[],
  members: TeamMember[]
): RoleSlice[] {
  const nameByUid: Record<string, string> = {};
  for (const m of members) {
    nameByUid[m.user.id] = `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  const counts: Record<string, number> = {};
  for (const task of currentTasks) {
    if (task.status === "Complete" || task.status === "Cancelled") continue;
    const label = task.assigned_to ? (nameByUid[task.assigned_to] ?? "Unassigned") : "Unassigned";
    counts[label] = (counts[label] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeMemberThroughputSparklines(
  history: TaskStateHistoryEntry[],
  currentTasks: Task[],
  members: TeamMember[],
  since: Date,
  until: Date
): MemberSparkline[] {
  // Build taskId → assigneeId from currentTasks
  const assigneeByTask: Record<string, string> = {};
  for (const t of currentTasks) {
    if (t.assigned_to) assigneeByTask[t.id] = t.assigned_to;
  }

  const nameByUid: Record<string, string> = {};
  for (const m of members) {
    nameByUid[m.user.id] = `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  // Count completions per member per week
  const countsByMember: Record<string, Record<string, number>> = {};
  for (const e of history) {
    if (e.to_status !== "Complete" || !e.task_id) continue;
    const at = toDate(e.transitioned_at);
    if (at < since || at > until) continue;
    const assigneeId = assigneeByTask[e.task_id];
    if (!assigneeId) continue;
    const ws = weekStart(at);
    if (!countsByMember[assigneeId]) countsByMember[assigneeId] = {};
    countsByMember[assigneeId][ws] = (countsByMember[assigneeId][ws] ?? 0) + 1;
  }

  // Fill weeks for each member
  const allWeeks: string[] = [];
  let cursor = new Date(since);
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  while (cursor <= until) {
    allWeeks.push(toDateStr(cursor));
    cursor = addDays(cursor, 7);
  }

  return members
    .filter((m) => countsByMember[m.user.id])
    .map((m) => ({
      memberId: m.user.id,
      memberName: nameByUid[m.user.id] ?? m.user.username,
      points: allWeeks.map((ws) => ({ weekStart: ws, count: countsByMember[m.user.id]?.[ws] ?? 0 })),
    }));
}

// ── Ideas Pipeline ────────────────────────────────────────────────────────────

export function computeIdeasFunnel(
  stickies: StickyNote[],
  promotedWorkflows: Workflow[]
): IdeasFunnelData {
  const created = stickies.length;
  const promoted = stickies.filter((s) => s.workflow_id !== null).length;
  const completed = promotedWorkflows.filter((w) => w.status === "Complete").length;
  return { created, promoted, completed };
}

export function computeIdeaAgeDistribution(
  stickies: StickyNote[],
  promotedWorkflows: Workflow[],
  today: Date,
  binDays = 7
): IdeaAgeBin[] {
  const promotedAt: Record<string, Date> = {};
  for (const wf of promotedWorkflows) promotedAt[wf.id] = toDate(wf.created_at);

  const ages: number[] = stickies.map((s) => {
    const end = s.workflow_id ? (promotedAt[s.workflow_id] ?? today) : today;
    return Math.max(0, (end.getTime() - toDate(s.created_at).getTime()) / MS_PER_DAY);
  });

  if (ages.length === 0) return [];

  const maxAge = Math.ceil(Math.max(...ages));
  const bins: IdeaAgeBin[] = [];
  for (let lo = 0; lo < maxAge; lo += binDays) {
    const hi = lo + binDays;
    const count = ages.filter((a) => a >= lo && a < hi).length;
    bins.push({ binLabel: `${lo}–${hi}d`, count });
  }
  return bins;
}
