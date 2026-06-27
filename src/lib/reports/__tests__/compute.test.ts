import {
  computeSprintProgress,
  computeBurndownSeries,
  computeVelocitySeries,
  computeSprintCompletionRate,
  computeCfdSeries,
  computeThroughputSeries,
  computeCycleTimeScatter,
  computeLeadTimeDistribution,
  computeWorkflowStepTiming,
  computeWorkflowFunnel,
  computeStoryAgingHeatmap,
  computeTeamLoad,
  computeTaskRoleDistribution,
  computeMemberThroughputSparklines,
  computeIdeasFunnel,
  computeIdeaAgeDistribution,
} from "../compute";
import type { Job, Workflow, Task, TeamMember, TaskStateHistoryEntry, StickyNote } from "../../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPRINT: Job = {
  id: "sprint-1",
  name: "Sprint 1",
  status: "In Progress",
  schedule_status: "On Time",
  team_id: "team-1",
  project_id: "proj-1",
  job_type: "sprint",
  start_date: "2026-06-01",
  end_date: "2026-06-14",
  archived: false,
  created_at: "2026-05-28T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
};

const wf = (id: string, points: number, status: Workflow["status"] = "Not Started"): Workflow => ({
  id,
  name: `Story ${id}`,
  is_template: false,
  status,
  schedule_status: "N/A",
  job_id: SPRINT.id,
  team_id: "team-1",
  is_shared: false,
  sort_order: 0,
  story_points: points,
  description: null,
  ticket_type: null,
  ticket_number: null,
  priority: null,
  reporter_id: null,
  created_by: "user-1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
});

const hist = (
  taskId: string,
  taskName: string,
  workflowId: string,
  fromStatus: string | null,
  toStatus: string,
  at: string
): TaskStateHistoryEntry => ({
  id: `${taskId}-${toStatus}-${at}`,
  transitioned_at: at,
  task_id: taskId,
  task_name: taskName,
  workflow_id: workflowId,
  workflow_name: `Story ${workflowId}`,
  job_id: SPRINT.id,
  job_name: SPRINT.name,
  from_status: fromStatus,
  to_status: toStatus,
  actor_id: "user-1",
  actor_username: "testuser",
  actor_type: "user",
  propagation_depth: 0,
  metadata: null,
});

const task = (id: string, workflowId: string, status: Task["status"] = "Not Started", assignedTo?: string): Task => ({
  id,
  name: `Task ${id}`,
  is_template: false,
  status,
  schedule_status: "N/A",
  workflow_id: workflowId,
  task_type: "standard",
  assigned_to: assignedTo ?? null,
  effort: null,
  canvas_x: 0,
  canvas_y: 0,
  start_time: null,
  end_time: null,
  is_start: false,
  is_end: false,
  decision_outcome: null,
  decision_input_port: null,
  input_values: null,
  output_values: null,
  is_locked: false,
  rework_task_id: null,
  loop_block_id: null,
  description: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
});

const member = (id: string, name: string): TeamMember => ({
  id: `tm-${id}`,
  user: {
    id,
    username: name.toLowerCase().replace(" ", "."),
    first_name: name.split(" ")[0],
    last_name: name.split(" ")[1] ?? null,
    email: `${id}@test.com`,
    avatar_url: null,
  },
  status: "active",
  role: "member",
  team_roles: [],
});

// ── computeSprintProgress ─────────────────────────────────────────────────────

describe("computeSprintProgress", () => {
  it("returns 100% done and green when all stories complete", () => {
    const workflows = [wf("w1", 5, "Complete"), wf("w2", 3, "Complete")];
    const today = new Date("2026-06-07T12:00:00Z"); // mid-sprint
    const result = computeSprintProgress(workflows, SPRINT, today);
    expect(result.totalPoints).toBe(8);
    expect(result.donePoints).toBe(8);
    expect(result.pctDone).toBe(100);
    expect(result.trafficLight).toBe("green");
  });

  it("returns red when significantly behind pace", () => {
    const workflows = [wf("w1", 5), wf("w2", 3)]; // 0% done
    // 13 of 14 days elapsed → expected 93%
    const today = new Date("2026-06-13T12:00:00Z");
    const result = computeSprintProgress(workflows, SPRINT, today);
    expect(result.pctDone).toBe(0);
    expect(result.trafficLight).toBe("red");
  });

  it("returns green at sprint start with 0% done", () => {
    const workflows = [wf("w1", 5)];
    const today = new Date("2026-06-01T00:00:00Z"); // sprint start
    const result = computeSprintProgress(workflows, SPRINT, today);
    // 0 days elapsed → expected 0% → green
    expect(result.trafficLight).toBe("green");
  });

  it("handles zero story points gracefully", () => {
    const result = computeSprintProgress([], SPRINT, new Date("2026-06-07T00:00:00Z"));
    expect(result.totalPoints).toBe(0);
    expect(result.pctDone).toBe(0);
  });

  it("computes daysRemaining correctly", () => {
    const today = new Date("2026-06-10T00:00:00Z"); // 4 days before end
    const result = computeSprintProgress([wf("w1", 5)], SPRINT, today);
    expect(result.daysRemaining).toBe(4);
    expect(result.daysTotal).toBe(13);
  });
});

// ── computeBurndownSeries ─────────────────────────────────────────────────────

describe("computeBurndownSeries", () => {
  it("starts at totalPoints and decrements when stories complete", () => {
    const workflows = [wf("w1", 5), wf("w2", 3), wf("w3", 4)];
    const history = [
      // w1's is_end task completes on day 3
      hist("t1", "Implement", "w1", "In Progress", "Complete", "2026-06-04T10:00:00Z"),
      // w2's is_end task completes on day 7
      hist("t2", "Deploy", "w2", "In Progress", "Complete", "2026-06-08T10:00:00Z"),
    ];
    const taskMeta: Record<string, { is_end: boolean; workflow_id: string }> = {
      "t1": { is_end: true, workflow_id: "w1" },
      "t2": { is_end: true, workflow_id: "w2" },
    };

    const points = computeBurndownSeries(SPRINT, workflows, history, taskMeta);
    expect(points[0].remaining).toBe(12); // day 0: nothing done
    expect(points[0].ideal).toBe(12);
    // After day 3: w1 (5pts) complete
    expect(points[3].remaining).toBe(7);
    // After day 7: w2 (3pts) complete
    expect(points[7].remaining).toBe(4);
    // w3 never completes
    expect(points[points.length - 1].remaining).toBe(4);
  });

  it("ideal line reaches 0 on last day", () => {
    const points = computeBurndownSeries(SPRINT, [wf("w1", 10)], [], {});
    expect(points[0].ideal).toBe(10);
    expect(points[points.length - 1].ideal).toBe(0);
  });

  it("returns empty array when sprint has no dates", () => {
    const sprintNoDates = { ...SPRINT, start_date: null, end_date: null };
    const points = computeBurndownSeries(sprintNoDates, [wf("w1", 5)], [], {});
    expect(points).toHaveLength(0);
  });
});

// ── computeVelocitySeries ─────────────────────────────────────────────────────

describe("computeVelocitySeries", () => {
  it("sums complete workflow points per sprint", () => {
    const s1 = { ...SPRINT, id: "s1", name: "S1" };
    const s2 = { ...SPRINT, id: "s2", name: "S2" };
    const wfBySprint = {
      s1: [wf("w1", 5, "Complete"), wf("w2", 3)],
      s2: [wf("w3", 8, "Complete"), wf("w4", 2, "Complete")],
    };
    const { bars, rollingAvg } = computeVelocitySeries([s1, s2], wfBySprint);
    expect(bars[0].delivered).toBe(5);
    expect(bars[1].delivered).toBe(10);
    expect(rollingAvg[0]).toBe(5);
    expect(rollingAvg[1]).toBe(8); // avg of 5 and 10
  });

  it("rolling average window is 3 sprints", () => {
    const sprints = ["s1", "s2", "s3", "s4"].map((id) => ({ ...SPRINT, id, name: id }));
    const wfBySprint = {
      s1: [wf("w1", 4, "Complete")],
      s2: [wf("w2", 8, "Complete")],
      s3: [wf("w3", 6, "Complete")],
      s4: [wf("w4", 10, "Complete")],
    };
    const { rollingAvg } = computeVelocitySeries(sprints, wfBySprint);
    // s4 rolling avg: (8+6+10)/3 = 8
    expect(rollingAvg[3]).toBe(8);
  });
});

// ── computeCfdSeries ──────────────────────────────────────────────────────────

describe("computeCfdSeries", () => {
  it("seeds tasks with no history at their current status", () => {
    const tasks = [
      task("t1", "w1", "In Progress"),
      task("t2", "w1", "Not Started"),
    ];
    const points = computeCfdSeries(SPRINT, [], tasks);
    // All points should show t1 as In Progress, t2 as Not Started throughout
    expect(points[0]["In Progress"]).toBe(1);
    expect(points[0]["Not Started"]).toBe(1);
    expect(points[points.length - 1]["In Progress"]).toBe(1);
  });

  it("applies transitions forward from sprint start", () => {
    const tasks = [task("t1", "w1", "Complete")];
    const history = [
      hist("t1", "Build", "w1", "Not Started", "In Progress", "2026-06-03T10:00:00Z"),
      hist("t1", "Build", "w1", "In Progress", "Complete",    "2026-06-05T10:00:00Z"),
    ];
    const points = computeCfdSeries(SPRINT, history, tasks);
    // Day 0 (Jun 1): from_status of first transition = "Not Started"
    expect(points[0]["Not Started"]).toBe(1);
    // Day 2 (Jun 3): after transition to In Progress
    expect(points[2]["In Progress"]).toBe(1);
    // Day 4 (Jun 5): after transition to Complete
    expect(points[4]["Complete"]).toBe(1);
  });

  it("sums to total task count at every point", () => {
    const tasks = [task("t1", "w1", "Complete"), task("t2", "w1", "In Progress"), task("t3", "w1", "Not Started")];
    const points = computeCfdSeries(SPRINT, [], tasks);
    for (const p of points) {
      const sum = p["Not Started"] + p["Ready"] + p["In Progress"] + p["On Hold"] + p["Complete"] + p["Cancelled"];
      expect(sum).toBe(3);
    }
  });
});

// ── computeCycleTimeScatter ───────────────────────────────────────────────────

describe("computeCycleTimeScatter", () => {
  it("calculates cycle time from In Progress to Complete", () => {
    const history = [
      hist("t1", "Build", "w1", "Not Started", "In Progress", "2026-06-01T00:00:00Z"),
      hist("t1", "Build", "w1", "In Progress",  "Complete",   "2026-06-04T00:00:00Z"), // 3 days
    ];
    const { points, p50, p85, p95 } = computeCycleTimeScatter(history);
    expect(points).toHaveLength(1);
    expect(points[0].cycleTimeDays).toBe(3);
    expect(p50).toBe(3);
    expect(p85).toBe(3);
    expect(p95).toBe(3);
  });

  it("computes correct percentiles for multiple tasks", () => {
    // Known dataset: cycle times [1, 2, 3, 4, 5, 10] days
    // Each task: In Progress starts at baseDay, Complete at baseDay + cycleTime
    const makeHistory = (taskId: string, baseDay: number, cycleTimeDays: number) => [
      hist(taskId, "Step", "w1", "Not Started", "In Progress",
        new Date(Date.UTC(2026, 5, 1) + baseDay * 86400000).toISOString()),
      hist(taskId, "Step", "w1", "In Progress", "Complete",
        new Date(Date.UTC(2026, 5, 1) + (baseDay + cycleTimeDays) * 86400000).toISOString()),
    ];
    const history = [
      ...makeHistory("t1", 0,  1),
      ...makeHistory("t2", 1,  2),
      ...makeHistory("t3", 3,  3),
      ...makeHistory("t4", 6,  4),
      ...makeHistory("t5", 10, 5),
      ...makeHistory("t6", 15, 10),
    ];
    const { p50 } = computeCycleTimeScatter(history);
    // p50 of [1,2,3,4,5,10] = midpoint of 3 and 4 = 3.5
    expect(p50).toBeGreaterThanOrEqual(3);
    expect(p50).toBeLessThanOrEqual(4);
  });

  it("returns empty result when no task completes", () => {
    const history = [hist("t1", "Step", "w1", null, "In Progress", "2026-06-01T00:00:00Z")];
    const { points } = computeCycleTimeScatter(history);
    expect(points).toHaveLength(0);
  });
});

// ── computeThroughputSeries ───────────────────────────────────────────────────

describe("computeThroughputSeries", () => {
  it("counts completions per week", () => {
    const history = [
      hist("t1", "S", "w1", "In Progress", "Complete", "2026-06-01T00:00:00Z"), // Mon week
      hist("t2", "S", "w1", "In Progress", "Complete", "2026-06-02T00:00:00Z"), // same week
      hist("t3", "S", "w2", "In Progress", "Complete", "2026-06-08T00:00:00Z"), // next week
    ];
    const since = new Date("2026-06-01");
    const until = new Date("2026-06-14");
    const bars = computeThroughputSeries(history, since, until);
    expect(bars.find((b) => b.weekStart === "2026-06-01")?.count).toBe(2);
    expect(bars.find((b) => b.weekStart === "2026-06-08")?.count).toBe(1);
  });

  it("excludes non-Complete transitions", () => {
    const history = [
      hist("t1", "S", "w1", null, "In Progress", "2026-06-01T00:00:00Z"),
      hist("t1", "S", "w1", "In Progress", "On Hold", "2026-06-02T00:00:00Z"),
    ];
    const bars = computeThroughputSeries(history, new Date("2026-06-01"), new Date("2026-06-07"));
    const total = bars.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(0);
  });
});

// ── fetchAllJobTaskHistory pagination (pure logic) ────────────────────────────

describe("fetchAllJobTaskHistory pagination logic", () => {
  it("combines pages until page is shorter than limit", async () => {
    // Simulate the logic: 1000 entries then 500 → 1500 total
    const pageSize = 1000;
    const page1 = Array.from({ length: 1000 }, (_, i) =>
      hist(`t${i}`, "Step", "w1", null, "In Progress", "2026-06-01T00:00:00Z")
    );
    const page2 = Array.from({ length: 500 }, (_, i) =>
      hist(`t${i + 1000}`, "Step", "w1", null, "Complete", "2026-06-02T00:00:00Z")
    );

    let callCount = 0;
    const fakeFetch = async (_token: string, _jobId: string, params?: { offset?: number }) => {
      callCount++;
      return (params?.offset ?? 0) === 0 ? page1 : page2;
    };

    // Reproduce the pagination loop
    const all: TaskStateHistoryEntry[] = [];
    let offset = 0;
    while (true) {
      const page = await fakeFetch("tok", "job-1", { offset });
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    expect(callCount).toBe(2);
    expect(all).toHaveLength(1500);
  });
});

// ── computeWorkflowStepTiming ─────────────────────────────────────────────────

describe("computeWorkflowStepTiming", () => {
  it("computes average days per step name", () => {
    const history = [
      hist("t1", "Write Up", "w1", "Not Started", "In Progress", "2026-06-01T00:00:00Z"),
      hist("t1", "Write Up", "w1", "In Progress",  "Complete",   "2026-06-03T00:00:00Z"), // 2 days
      hist("t2", "Write Up", "w2", "Not Started", "In Progress", "2026-06-01T00:00:00Z"),
      hist("t2", "Write Up", "w2", "In Progress",  "Complete",   "2026-06-05T00:00:00Z"), // 4 days
    ];
    const bars = computeWorkflowStepTiming(history);
    expect(bars).toHaveLength(1);
    expect(bars[0].stepName).toBe("Write Up");
    expect(bars[0].avgDays).toBe(3); // (2+4)/2
  });
});

// ── computeStoryAgingHeatmap ──────────────────────────────────────────────────

describe("computeStoryAgingHeatmap", () => {
  it("excludes complete and cancelled stories", () => {
    const workflows = [
      wf("w1", 5, "In Progress"),
      wf("w2", 3, "Complete"),
      wf("w3", 2, "Cancelled"),
    ];
    const today = new Date("2026-06-10T00:00:00Z");
    const cells = computeStoryAgingHeatmap(workflows, [], today);
    expect(cells).toHaveLength(1);
    expect(cells[0].workflowId).toBe("w1");
  });

  it("uses last history transition timestamp for age calculation", () => {
    const workflows = [wf("w1", 5, "In Progress")];
    const history = [
      hist("t1", "Build", "w1", "Not Started", "In Progress", "2026-06-05T00:00:00Z"),
    ];
    const today = new Date("2026-06-10T00:00:00Z");
    const cells = computeStoryAgingHeatmap(workflows, history, today);
    expect(cells[0].daysInCurrentState).toBe(5);
  });
});

// ── computeIdeasFunnel ────────────────────────────────────────────────────────

const sticky = (id: string, workflowId?: string): StickyNote => ({
  id,
  title: `Idea ${id}`,
  body: null,
  color: "yellow",
  x: 0, y: 0, width: 200, height: 150,
  created_by: "user-1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  workflow_id: workflowId ?? null,
});

describe("computeIdeasFunnel", () => {
  it("counts created, promoted, completed correctly", () => {
    const stickies = [
      sticky("s1", "w1"),
      sticky("s2", "w2"),
      sticky("s3"),        // not promoted
    ];
    const promotedWfs = [
      wf("w1", 5, "Complete"),
      wf("w2", 3, "In Progress"),
    ];
    const result = computeIdeasFunnel(stickies, promotedWfs);
    expect(result.created).toBe(3);
    expect(result.promoted).toBe(2);
    expect(result.completed).toBe(1);
  });
});

// ── computeTeamLoad ───────────────────────────────────────────────────────────

describe("computeTeamLoad", () => {
  it("attributes points to the member with assigned tasks", () => {
    const workflows = [wf("w1", 8, "Complete"), wf("w2", 5, "In Progress")];
    const tasks = [
      task("t1", "w1", "Complete", "user-a"),
      task("t2", "w2", "In Progress", "user-a"),
    ];
    const members = [member("user-a", "Alice Smith")];
    const bars = computeTeamLoad(workflows, tasks, members);
    expect(bars[0].assigneeName).toBe("Alice Smith");
    expect(bars[0].plannedPoints).toBe(13); // w1 + w2
    expect(bars[0].deliveredPoints).toBe(8); // only w1 Complete
  });
});

// ── computeTaskRoleDistribution ───────────────────────────────────────────────

describe("computeTaskRoleDistribution", () => {
  it("counts open tasks by assignee", () => {
    const tasks = [
      task("t1", "w1", "In Progress", "user-a"),
      task("t2", "w1", "Ready",       "user-a"),
      task("t3", "w2", "In Progress", "user-b"),
      task("t4", "w2", "Complete",    "user-a"), // excluded
    ];
    const members = [member("user-a", "Alice Smith"), member("user-b", "Bob Jones")];
    const slices = computeTaskRoleDistribution(tasks, members);
    const alice = slices.find((s) => s.label === "Alice Smith");
    const bob   = slices.find((s) => s.label === "Bob Jones");
    expect(alice?.count).toBe(2);
    expect(bob?.count).toBe(1);
  });
});
