"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  Job, Workflow, Task, TeamMember, StickyNote,
  TaskStateHistoryEntry, DashboardConfig, ReportId, PresetId, ReportInterval,
} from "@/lib/types";
import { PRESETS, DEFAULT_PRESET } from "@/lib/reports/catalog";
import {
  listWorkflows, listTasks, fetchAllJobTaskHistory,
} from "@/lib/awe-api";
import { listIdeaBoards, listStickies } from "@/lib/notes-api";
import { useInterval } from "@/hooks/useInterval";
import ReportControlBar from "./ReportControlBar";
import ManageDashboardDrawer from "./ManageDashboardDrawer";
import ReportGrid from "./ReportGrid";

interface Props {
  projectId: string;
  sprints: Job[];
  token: string;
  teamMembers: TeamMember[];
}

function loadConfig(projectId: string): DashboardConfig {
  try {
    const raw = localStorage.getItem(`togra_reports_${projectId}`);
    if (!raw) return { version: 1, enabledReportIds: [...PRESETS[DEFAULT_PRESET]], presetId: DEFAULT_PRESET };
    const parsed = JSON.parse(raw) as DashboardConfig;
    if (parsed.version !== 1) return { version: 1, enabledReportIds: [...PRESETS[DEFAULT_PRESET]], presetId: DEFAULT_PRESET };
    return parsed;
  } catch {
    return { version: 1, enabledReportIds: [...PRESETS[DEFAULT_PRESET]], presetId: DEFAULT_PRESET };
  }
}

function saveConfig(projectId: string, config: DashboardConfig) {
  try { localStorage.setItem(`togra_reports_${projectId}`, JSON.stringify(config)); }
  catch { /* ignore quota errors */ }
}

export interface SprintReportData {
  workflows: Workflow[];
  history: TaskStateHistoryEntry[];
  tasks: Task[];
  taskMeta: Record<string, { is_end: boolean; workflow_id: string }>;
  allSprintWorkflows: Record<string, Workflow[]>;
  loading: boolean;
}

export default function ReportsTab({ projectId, sprints, token, teamMembers }: Props) {
  const activeSprints = sprints.filter((j) => j.job_type === "sprint");
  const latestSprint = activeSprints[activeSprints.length - 1] ?? null;

  const [selectedSprintId, setSelectedSprintId] = useState<string | "all">(latestSprint?.id ?? "all");
  const [dateFrom, setDateFrom] = useState<string>(latestSprint?.start_date ?? "");
  const [dateTo, setDateTo] = useState<string>(latestSprint?.end_date ?? "");
  const [isLive, setIsLive] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<ReportInterval>(60);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [config, setConfig] = useState<DashboardConfig>(() => loadConfig(projectId));

  // ── Data state ──────────────────────────────────────────────────────────────
  const [sprintData, setSprintData] = useState<SprintReportData>({
    workflows: [], history: [], tasks: [], taskMeta: {}, allSprintWorkflows: {}, loading: false,
  });
  const allSprintWorkflowsRef = useRef<Record<string, Workflow[]>>({});
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [promotedWorkflows, setPromotedWorkflows] = useState<Workflow[]>([]);

  // Sync date range when sprint selection changes
  useEffect(() => {
    if (selectedSprintId === "all") return;
    const sprint = activeSprints.find((s) => s.id === selectedSprintId);
    if (sprint) {
      setDateFrom(sprint.start_date ?? "");
      setDateTo(sprint.end_date ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId]);

  // Load all sprint workflows + ideas data once on mount
  useEffect(() => {
    if (!token) return;
    // Sprint workflows for velocity/completion rate
    if (activeSprints.length > 0) {
      Promise.all(activeSprints.map((s) => listWorkflows(token, { job_id: s.id }))).then((results) => {
        const byId: Record<string, Workflow[]> = {};
        activeSprints.forEach((s, i) => { byId[s.id] = results[i]; });
        allSprintWorkflowsRef.current = byId;
        setSprintData((prev) => ({ ...prev, allSprintWorkflows: byId }));
      });
    }
    // Stickies for ideas pipeline
    listIdeaBoards(token, projectId).then(async (boards) => {
      const stickyLists = await Promise.all(boards.map((b) => listStickies(token, b.id)));
      const allStickies = stickyLists.flat();
      setStickies(allStickies);
      // Load promoted workflows (stickies that have a workflow_id)
      const promotedIds = [...new Set(allStickies.filter((s) => s.workflow_id).map((s) => s.workflow_id as string))];
      if (promotedIds.length > 0) {
        // Fetch from backlog — workflows are already in allSprintWorkflows or can be fetched from backlog
        // We get them from the project's backlog job
        const backlogJob = sprints.find((j) => j.job_type === "backlog");
        if (backlogJob) {
          listWorkflows(token, { job_id: backlogJob.id }).then(setPromotedWorkflows);
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadSprintData = useCallback(async () => {
    if (!token || !selectedSprintId || selectedSprintId === "all") return;
    setSprintData((prev) => ({ ...prev, loading: true }));
    try {
      const [wfs, history] = await Promise.all([
        listWorkflows(token, { job_id: selectedSprintId }),
        fetchAllJobTaskHistory(token, selectedSprintId),
      ]);
      // Fetch all tasks per workflow in parallel (for burndown is_end + assignees)
      const tasksByWf = await Promise.all(wfs.map((w) => listTasks(token, w.id)));
      const allTasks = tasksByWf.flat();
      const taskMeta: Record<string, { is_end: boolean; workflow_id: string }> = {};
      wfs.forEach((w, i) => {
        tasksByWf[i].forEach((t) => { taskMeta[t.id] = { is_end: t.is_end, workflow_id: w.id }; });
      });
      setSprintData((prev) => ({
        ...prev,
        workflows: wfs,
        history,
        tasks: allTasks,
        taskMeta,
        allSprintWorkflows: allSprintWorkflowsRef.current,
        loading: false,
      }));
    } catch {
      setSprintData((prev) => ({ ...prev, loading: false }));
    }
  }, [token, selectedSprintId]);

  // Load on sprint change
  useEffect(() => { loadSprintData(); }, [loadSprintData]);

  // Live mode refresh
  useInterval(loadSprintData, isLive ? refreshInterval * 1000 : null);

  const handleSprintChange = useCallback((sprintId: string | "all") => {
    setSelectedSprintId(sprintId);
  }, []);

  const handleToggleReport = useCallback((id: ReportId, enabled: boolean) => {
    setConfig((prev) => {
      const next: DashboardConfig = {
        ...prev,
        presetId: undefined,
        enabledReportIds: enabled
          ? [...prev.enabledReportIds, id]
          : prev.enabledReportIds.filter((r) => r !== id),
      };
      saveConfig(projectId, next);
      return next;
    });
  }, [projectId]);

  const handleApplyPreset = useCallback((presetId: PresetId) => {
    const next: DashboardConfig = { version: 1, enabledReportIds: [...PRESETS[presetId]], presetId };
    saveConfig(projectId, next);
    setConfig(next);
  }, [projectId]);

  const selectedSprint = activeSprints.find((s) => s.id === selectedSprintId) ?? null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">
      <ReportControlBar
        sprints={activeSprints}
        selectedSprintId={selectedSprintId}
        onSprintChange={handleSprintChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        isLive={isLive}
        onToggleLive={() => setIsLive((v) => !v)}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
        onManageDashboard={() => setDrawerOpen(true)}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <ReportGrid
          config={config}
          selectedSprint={selectedSprint}
          dateFrom={dateFrom}
          dateTo={dateTo}
          isLive={isLive}
          allSprints={activeSprints}
          teamMembers={teamMembers}
          sprintData={sprintData}
          stickies={stickies}
          promotedWorkflows={promotedWorkflows}
        />
      </div>

      {drawerOpen && (
        <ManageDashboardDrawer
          config={config}
          onToggleReport={handleToggleReport}
          onApplyPreset={handleApplyPreset}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
