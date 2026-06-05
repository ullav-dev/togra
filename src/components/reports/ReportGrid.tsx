"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Job, TeamMember, DashboardConfig, StickyNote, Workflow } from "@/lib/types";
import { REPORT_CATALOG } from "@/lib/reports/catalog";
import type { SprintReportData } from "./ReportsTab";
import ReportTile from "./ReportTile";

// Chart components — sprint
import SprintProgressGauge from "./sprint/SprintProgressGauge";
import BurndownChart from "./sprint/BurndownChart";
import VelocityChart from "./sprint/VelocityChart";
import SprintCompletionRate from "./sprint/SprintCompletionRate";

// Chart components — flow
import CumulativeFlowDiagram from "./flow/CumulativeFlowDiagram";
import ThroughputChart from "./flow/ThroughputChart";
import CycleTimeScatter from "./flow/CycleTimeScatter";
import LeadTimeDistribution from "./flow/LeadTimeDistribution";

// Chart components — process
import WorkflowStepTiming from "./process/WorkflowStepTiming";
import WorkflowFunnel from "./process/WorkflowFunnel";
import StoryAgingHeatmap from "./process/StoryAgingHeatmap";

// Chart components — team
import TeamLoadChart from "./team/TeamLoadChart";
import TaskRoleDistribution from "./team/TaskRoleDistribution";
import MemberThroughputSparklines from "./team/MemberThroughputSparklines";

// Chart components — ideas
import IdeasFunnel from "./ideas/IdeasFunnel";
import IdeaAgeDistribution from "./ideas/IdeaAgeDistribution";

// Compute functions
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
} from "@/lib/reports/compute";

interface Props {
  config: DashboardConfig;
  selectedSprint: Job | null;
  dateFrom: string;
  dateTo: string;
  isLive: boolean;
  allSprints: Job[];
  teamMembers: TeamMember[];
  sprintData: SprintReportData;
  stickies: StickyNote[];
  promotedWorkflows: Workflow[];
}

export default function ReportGrid({
  config, selectedSprint, dateFrom, dateTo, isLive,
  allSprints, teamMembers, sprintData, stickies, promotedWorkflows,
}: Props) {
  const t = useTranslations("reports");
  const today = useMemo(() => new Date(), []);

  // ── Sprint computes ─────────────────────────────────────────────────────────
  const sprintProgress = useMemo(() => {
    if (!selectedSprint || sprintData.workflows.length === 0) return null;
    return computeSprintProgress(sprintData.workflows, selectedSprint, today);
  }, [sprintData.workflows, selectedSprint, today]);

  const burndown = useMemo(() => {
    if (!selectedSprint) return [];
    return computeBurndownSeries(selectedSprint, sprintData.workflows, sprintData.history, sprintData.taskMeta);
  }, [selectedSprint, sprintData.workflows, sprintData.history, sprintData.taskMeta]);

  const { bars: velocityBars, rollingAvg } = useMemo(
    () => computeVelocitySeries(allSprints, sprintData.allSprintWorkflows),
    [allSprints, sprintData.allSprintWorkflows]
  );

  const completionRateData = useMemo(
    () => computeSprintCompletionRate(allSprints, sprintData.allSprintWorkflows),
    [allSprints, sprintData.allSprintWorkflows]
  );

  // ── Flow computes ───────────────────────────────────────────────────────────
  const cfdData = useMemo(() => {
    if (!selectedSprint) return [];
    return computeCfdSeries(selectedSprint, sprintData.history, sprintData.tasks);
  }, [selectedSprint, sprintData.history, sprintData.tasks]);

  const since = useMemo(() => (dateFrom ? new Date(dateFrom) : new Date(0)), [dateFrom]);
  const until = useMemo(() => (dateTo ? new Date(dateTo) : new Date()), [dateTo]);

  const throughputData = useMemo(
    () => computeThroughputSeries(sprintData.history, since, until),
    [sprintData.history, since, until]
  );

  const cycleTimeData = useMemo(
    () => computeCycleTimeScatter(sprintData.history),
    [sprintData.history]
  );

  const leadTimeData = useMemo(
    () => computeLeadTimeDistribution(sprintData.history, sprintData.tasks),
    [sprintData.history, sprintData.tasks]
  );

  // ── Process computes ────────────────────────────────────────────────────────
  const stepTimingData = useMemo(
    () => computeWorkflowStepTiming(sprintData.history),
    [sprintData.history]
  );

  const funnelData = useMemo(
    () => computeWorkflowFunnel(sprintData.history),
    [sprintData.history]
  );

  const agingData = useMemo(
    () => computeStoryAgingHeatmap(sprintData.workflows, sprintData.history, today),
    [sprintData.workflows, sprintData.history, today]
  );

  // ── Team computes ───────────────────────────────────────────────────────────
  const teamLoadData = useMemo(
    () => computeTeamLoad(sprintData.workflows, sprintData.tasks, teamMembers),
    [sprintData.workflows, sprintData.tasks, teamMembers]
  );

  const roleDistData = useMemo(
    () => computeTaskRoleDistribution(sprintData.tasks, teamMembers),
    [sprintData.tasks, teamMembers]
  );

  const memberSparklines = useMemo(
    () => computeMemberThroughputSparklines(sprintData.history, sprintData.tasks, teamMembers, since, until),
    [sprintData.history, sprintData.tasks, teamMembers, since, until]
  );

  // ── Ideas computes ──────────────────────────────────────────────────────────
  const ideasFunnelData = useMemo(
    () => computeIdeasFunnel(stickies, promotedWorkflows),
    [stickies, promotedWorkflows]
  );

  const ideaAgeData = useMemo(
    () => computeIdeaAgeDistribution(stickies, promotedWorkflows, today),
    [stickies, promotedWorkflows, today]
  );

  if (config.enabledReportIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <p className="text-sm font-medium">{t("tile.noData")}</p>
        <p className="text-xs mt-1 opacity-60">{t("controls.manageDashboard")}</p>
      </div>
    );
  }

  const sprintLoading = sprintData.loading;
  const ideasCategories = new Set(["ideas_funnel", "idea_age_distribution"]);
  const multiSprintCategories = new Set(["velocity_chart", "sprint_completion_rate"]);

  function isTileLoading(reportId: string) {
    if (ideasCategories.has(reportId)) return false; // ideas load separately, show data when ready
    if (multiSprintCategories.has(reportId)) return Object.keys(sprintData.allSprintWorkflows).length === 0;
    return sprintLoading;
  }

  function renderChart(reportId: string) {
    switch (reportId) {
      case "sprint_progress_gauge":
        return sprintProgress
          ? <SprintProgressGauge data={sprintProgress} />
          : null;

      case "burndown_chart":
        return <BurndownChart data={burndown} />;

      case "velocity_chart":
        return <VelocityChart bars={velocityBars} rollingAvg={rollingAvg} />;

      case "sprint_completion_rate":
        return <SprintCompletionRate data={completionRateData} />;

      case "cumulative_flow_diagram":
        return <CumulativeFlowDiagram data={cfdData} />;

      case "throughput_chart":
        return <ThroughputChart data={throughputData} />;

      case "cycle_time_scatter":
        return <CycleTimeScatter data={cycleTimeData} />;

      case "lead_time_distribution":
        return <LeadTimeDistribution data={leadTimeData} />;

      case "workflow_step_timing":
        return <WorkflowStepTiming data={stepTimingData} />;

      case "workflow_funnel":
        return <WorkflowFunnel data={funnelData} />;

      case "story_aging_heatmap":
        return <StoryAgingHeatmap data={agingData} />;

      case "team_load_chart":
        return <TeamLoadChart data={teamLoadData} />;

      case "task_role_distribution":
        return <TaskRoleDistribution data={roleDistData} />;

      case "member_throughput_sparklines":
        return <MemberThroughputSparklines data={memberSparklines} />;

      case "ideas_funnel":
        return <IdeasFunnel data={ideasFunnelData} />;

      case "idea_age_distribution":
        return <IdeaAgeDistribution data={ideaAgeData} />;

      default:
        // Phases 4–5: placeholder until chart is built
        return (
          <div className="w-full h-48 flex items-center justify-center text-slate-300 text-xs border border-dashed border-slate-200 rounded">
            {t(`catalog.${reportId}.title`)}
          </div>
        );
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {config.enabledReportIds.map((reportId) => {
        const meta = REPORT_CATALOG.find((r) => r.id === reportId);
        if (!meta) return null;
        const chart = renderChart(reportId);
        const tileLoading = isTileLoading(reportId);
        return (
          <ReportTile
            key={reportId}
            title={t(`catalog.${reportId}.title`)}
            description={t(`catalog.${reportId}.description`)}
            isLive={isLive}
            affectedByLive={meta.affectedByLive}
            loading={tileLoading}
            empty={!tileLoading && chart === null}
          >
            {chart}
          </ReportTile>
        );
      })}
    </div>
  );
}
