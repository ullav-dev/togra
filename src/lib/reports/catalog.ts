import type { ReportId, PresetId } from "../types";

export type ReportCategory = "sprint" | "flow" | "process" | "team" | "ideas";

export interface ReportMeta {
  id: ReportId;
  category: ReportCategory;
  affectedByLive: boolean;
}

export const REPORT_CATALOG: ReportMeta[] = [
  // Sprint
  { id: "sprint_progress_gauge",   category: "sprint", affectedByLive: true  },
  { id: "burndown_chart",          category: "sprint", affectedByLive: false },
  { id: "velocity_chart",          category: "sprint", affectedByLive: false },
  { id: "sprint_completion_rate",  category: "sprint", affectedByLive: false },
  // Flow
  { id: "cumulative_flow_diagram", category: "flow",    affectedByLive: true  },
  { id: "throughput_chart",        category: "flow",    affectedByLive: false },
  { id: "cycle_time_scatter",      category: "flow",    affectedByLive: false },
  { id: "lead_time_distribution",  category: "flow",    affectedByLive: false },
  // Process
  { id: "workflow_step_timing",    category: "process", affectedByLive: false },
  { id: "workflow_funnel",         category: "process", affectedByLive: false },
  { id: "story_aging_heatmap",     category: "process", affectedByLive: true  },
  // Team
  { id: "team_load_chart",              category: "team",  affectedByLive: false },
  { id: "task_role_distribution",       category: "team",  affectedByLive: false },
  { id: "member_throughput_sparklines", category: "team",  affectedByLive: false },
  // Ideas
  { id: "ideas_funnel",            category: "ideas",   affectedByLive: false },
  { id: "idea_age_distribution",   category: "ideas",   affectedByLive: false },
];

export const PRESETS: Record<PresetId, ReportId[]> = {
  sprint_overview:  ["sprint_progress_gauge", "burndown_chart", "velocity_chart", "sprint_completion_rate", "cumulative_flow_diagram", "team_load_chart"],
  flow_health:      ["cumulative_flow_diagram", "throughput_chart", "cycle_time_scatter", "lead_time_distribution"],
  process_insights: ["workflow_step_timing", "workflow_funnel", "story_aging_heatmap", "burndown_chart"],
  team_capacity:    ["team_load_chart", "task_role_distribution", "member_throughput_sparklines", "velocity_chart"],
  ideas_pipeline:   ["ideas_funnel", "idea_age_distribution", "sprint_completion_rate"],
  live_sprint_room: ["sprint_progress_gauge", "cumulative_flow_diagram", "story_aging_heatmap", "throughput_chart"],
};

export const DEFAULT_PRESET: PresetId = "sprint_overview";

export const REPORT_CATEGORIES: ReportCategory[] = ["sprint", "flow", "process", "team", "ideas"];
