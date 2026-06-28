"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getJob, listWorkflows, listTasks, updateTask, getTeam, listTaskOutgoingLinks, decideTask } from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type { Job, Workflow, Task, TaskLink, Project, Status, TeamMember } from "@/lib/types";
import NotesPanel from "@/components/notes/NotesPanel";
import ResearchPanel from "@/components/research/ResearchPanel";
import KanbanBoard from "@/components/KanbanBoard";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";

const TASK_COLUMNS: {
  status: Status;
  labelKey: string;
  bg: string;
  border: string;
  header: string;
  overBorder: string;
}[] = [
  { status: "Not Started", labelKey: "todo",       bg: "bg-slate-50",   border: "border-slate-200",   header: "text-slate-500",   overBorder: "border-violet-400 bg-violet-50" },
  { status: "Ready",       labelKey: "ready",      bg: "bg-violet-50",  border: "border-violet-200",  header: "text-violet-700",  overBorder: "border-violet-500 bg-violet-100" },
  { status: "In Progress", labelKey: "inProgress", bg: "bg-blue-50",    border: "border-blue-200",    header: "text-blue-700",    overBorder: "border-blue-400 bg-blue-100" },
  { status: "On Hold",     labelKey: "onHold",     bg: "bg-amber-50",   border: "border-amber-200",   header: "text-amber-700",   overBorder: "border-amber-400 bg-amber-100" },
  { status: "Complete",    labelKey: "done",       bg: "bg-emerald-50", border: "border-emerald-200", header: "text-emerald-700", overBorder: "border-emerald-400 bg-emerald-100" },
];

export default function SprintBoardPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id: projectId, jobId } = use(params);
  const { token, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("board");

  const columns = TASK_COLUMNS.map((col) => ({
    ...col,
    label: t(`columns.${col.labelKey}` as Parameters<typeof t>[0]),
  }));

  const [project, setProject] = useState<Project | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [stories, setStories] = useState<Workflow[]>([]);
  const [storyTasks, setStoryTasks] = useState<Record<string, Task[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<"story" | "member">("story");
  const [researchOpen, setResearchOpen] = useState(false);
  // "all" | "mine" | a team member's user ID
  const [taskFilter, setTaskFilter] = useState<"all" | "mine" | string>("all");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedTaskCtx, setSelectedTaskCtx] = useState<{ task: Task; workflowId: string; storyName: string } | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<Status>>(new Set());
  function toggleColumn(status: Status) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }
  const promotedRef = useRef(false);
  const { setCurrentProject } = useCurrentProject();

  // Load project, job, stories, team
  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProject(token, projectId),
      getJob(token, jobId),
      listWorkflows(token, { job_id: jobId }),
    ]).then(async ([proj, j, wfs]) => {
      setProject(proj);
      setJob(j);
      setStories(wfs);
      setCurrentProject({ id: projectId, name: proj.name });
      const teamId = j.team_id ?? proj.team_id ?? null;
      if (teamId) {
        const team = await getTeam(token, teamId).catch(() => null);
        if (team) setTeamMembers(team.members.filter((m) => m.status === "active"));
      }
    }).finally(() => setLoading(false));
  }, [token, projectId, jobId]);

  useEffect(() => {
    if (job && job.job_type === "backlog") router.replace(`/projects/${projectId}`);
  }, [job, projectId, router]);

  // Load all tasks for all stories
  useEffect(() => {
    if (!token || stories.length === 0) return;
    const unloaded = stories.filter((s) => !(s.id in storyTasks));
    if (unloaded.length === 0) return;
    setTasksLoading(true);
    Promise.all(unloaded.map((s) => listTasks(token, s.id).then((tasks) => ({ id: s.id, tasks }))))
      .then((results) => {
        setStoryTasks((prev) => {
          const next = { ...prev };
          results.forEach(({ id, tasks }) => { next[id] = tasks; });
          return next;
        });
      })
      .finally(() => setTasksLoading(false));
  }, [token, stories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Promote is_start tasks from Not Started → Ready (once per board load)
  useEffect(() => {
    if (!token || promotedRef.current) return;
    const allTasks = Object.values(storyTasks).flat();
    if (allTasks.length === 0) return;
    const toPromote = allTasks.filter((t) => t.is_start && t.status === "Not Started");
    if (toPromote.length === 0) { promotedRef.current = true; return; }
    promotedRef.current = true;
    Promise.all(toPromote.map((t) => updateTask(token, t.id, { status: "Ready" })))
      .then((updated) => {
        setStoryTasks((prev) => {
          const next = { ...prev };
          updated.forEach((u) => {
            if (next[u.workflow_id]) {
              next[u.workflow_id] = next[u.workflow_id].map((t) => t.id === u.id ? u : t);
            }
          });
          return next;
        });
      })
      .catch(() => {});
  }, [storyTasks, token]);

  const onTaskUpdated = useCallback((updated: Task) => {
    setStoryTasks((prev) => ({
      ...prev,
      [updated.workflow_id]: (prev[updated.workflow_id] ?? []).map((t) => t.id === updated.id ? updated : t),
    }));
    setSelectedTaskCtx((prev) => prev?.task.id === updated.id ? { ...prev, task: updated } : prev);
  }, []);

  async function onTaskEffortChange(taskId: string, workflowId: string, effort: number | null) {
    if (!token) return;
    const prevTask = storyTasks[workflowId]?.find((t) => t.id === taskId);
    if (!prevTask) return;
    setStoryTasks((prev) => ({
      ...prev,
      [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === taskId ? { ...t, effort } : t),
    }));
    try {
      const updated = await updateTask(token, taskId, { effort });
      setStoryTasks((prev) => ({
        ...prev,
        [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === updated.id ? updated : t),
      }));
    } catch {
      setStoryTasks((prev) => ({
        ...prev,
        [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === taskId ? prevTask : t),
      }));
    }
  }

  async function onTaskStatusChange(taskId: string, workflowId: string, newStatus: Status) {
    if (!token) return;
    const prevTask = storyTasks[workflowId]?.find((t) => t.id === taskId);
    if (!prevTask || prevTask.status === newStatus) return;
    // Optimistic update
    setStoryTasks((prev) => ({
      ...prev,
      [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === taskId ? { ...t, status: newStatus } : t),
    }));
    try {
      const updated = await updateTask(token, taskId, { status: newStatus });
      setStoryTasks((prev) => ({
        ...prev,
        [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === updated.id ? updated : t),
      }));
    } catch {
      // Rollback
      setStoryTasks((prev) => ({
        ...prev,
        [workflowId]: (prev[workflowId] ?? []).map((t) => t.id === taskId ? prevTask : t),
      }));
    }
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("loading")}</div>;
  if (!job) return <div className="p-8 text-slate-500 text-sm">{t("notFound")}</div>;

  // Kanban boards get their own dedicated view
  if (job.job_type === "kanban") {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/projects" className="hover:text-violet-700 transition-colors">{t("breadcrumbProjects")}</Link>
            <span>/</span>
            <Link href={`/projects/${projectId}?tab=management`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
            <span>/</span>
            <span className="text-slate-700 font-medium">{job.name}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">{job.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-700">{t("kanban")}</span>
          </div>
        </div>
        <KanbanBoard job={job} projectId={projectId} />
      </div>
    );
  }

  const typeLabel = job.job_type === "sprint" ? t("sprint") : "Board";
  const dateRange = job.start_date && job.end_date
    ? ` · ${fmtDate(job.start_date)} – ${fmtDate(job.end_date)}` : "";

  const totalTasks = Object.values(storyTasks).reduce((n, ts) => n + ts.length, 0);
  const memberLanes: (TeamMember | null)[] = [...teamMembers, null];

  function filterTasks(tasks: Task[]): Task[] {
    if (taskFilter === "all") return tasks;
    if (taskFilter === "mine") return tasks.filter((t) => t.assigned_to === (user?.id ?? ""));
    return tasks.filter((t) => t.assigned_to === taskFilter);
  }

  const isFiltered = taskFilter !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-violet-700 transition-colors">{t("breadcrumbProjects")}</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}?tab=management`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{job.name}</span>
        </nav>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-slate-800">{job.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            job.job_type === "sprint" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
          }`}>{typeLabel}</span>
          {dateRange && <span className="text-xs text-slate-400">{dateRange}</span>}
          <span className="text-xs text-slate-400">{t("stories", { count: stories.length })}</span>
          {tasksLoading && <span className="text-xs text-slate-400">{t("loadingTasks")}</span>}

          <div className="ml-auto flex items-center gap-3">
            {/* Task filter: All / My Tasks / any team member */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
              <button type="button" onClick={() => setTaskFilter("all")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${taskFilter === "all" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                All
              </button>
              <button type="button" onClick={() => setTaskFilter("mine")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${taskFilter === "mine" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-violet-700"}`}>
                My Tasks
              </button>
              {teamMembers.map((m) => {
                const name = `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
                const active = taskFilter === m.user.id;
                return (
                  <button key={m.user.id} type="button" onClick={() => setTaskFilter(active ? "all" : m.user.id)}
                    className={`rounded-full transition-all ${active ? "ring-2 ring-violet-500 ring-offset-1" : "opacity-60 hover:opacity-100"}`}>
                    <MemberAvatar member={m} size="sm" />
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-400 font-medium">{t("groupBy")}</span>
            <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => setGroupBy("story")}
                className={`px-3 py-1 transition-colors ${
                  groupBy === "story"
                    ? "bg-violet-600 text-white"
                    : "bg-white text-slate-500 hover:text-violet-700"
                }`}
              >
                {t("byStory")}
              </button>
              <button
                type="button"
                onClick={() => setGroupBy("member")}
                className={`px-3 py-1 border-l border-slate-200 transition-colors ${
                  groupBy === "member"
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-slate-500 hover:text-violet-700"
                }`}
              >
                {t("byMember")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResearchOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                researchOpen
                  ? "bg-violet-600 text-white"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Research
            </button>
          </div>
        </div>
      </div>

      {/* ── Board + Research panel ── */}
      <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="min-w-max">
          {/* Column header row */}
          <div className="flex mb-1">
            <div className="w-48 shrink-0" />
            {columns.map((col) => {
              const colCount = totalTasks > 0
                ? Object.values(storyTasks).flat().filter((t) => t.status === col.status).length
                : 0;
              const isCollapsible = col.status === "Not Started" || col.status === "Complete";
              const isCollapsed = collapsedColumns.has(col.status);
              return (
                <div
                  key={col.status}
                  className={`w-56 shrink-0 mx-1 px-3 py-2 rounded-t-lg border-t border-x ${col.bg} ${col.border}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${col.header}`}>{col.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {totalTasks > 0 && (
                        <span className={`text-xs font-medium ${isCollapsed ? col.header : "text-slate-400"}`}>
                          {colCount}
                        </span>
                      )}
                      {isCollapsible && (
                        <button
                          type="button"
                          onClick={() => toggleColumn(col.status)}
                          title={isCollapsed ? `Show ${col.label} tasks` : `Hide ${col.label} tasks`}
                          className={`transition-colors rounded p-0.5 ${isCollapsed ? `${col.header} hover:opacity-70` : "text-slate-400 hover:text-slate-600"}`}
                        >
                          {isCollapsed ? (
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M8 2C4.134 2 1 5.134 1 8s3.134 6 7 6 7-3.134 7-6-3.134-6-7-6ZM8 12.5A4.5 4.5 0 1 1 8 3.5a4.5 4.5 0 0 1 0 9Zm0-7.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14 10a.75.75 0 0 1-.88 1.214l-14-10A.75.75 0 0 1 .143 2.31ZM8 4.5a.75.75 0 0 0 0-1.5C5.134 3 2 5.67 2 8.5a.75.75 0 0 0 1.5 0C3.5 6.548 5.866 4.5 8 4.5ZM8 11.5a.75.75 0 0 0 0 1.5c2.866 0 6-2.67 6-5.5a.75.75 0 0 0-1.5 0c0 1.952-2.366 4-4.5 4Z"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lanes */}
          {groupBy === "story" ? (
            stories.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">{t("noStories")}</div>
            ) : (
              stories.flatMap((story) => {
                const visibleTasks = filterTasks(storyTasks[story.id] ?? []);
                if (isFiltered && visibleTasks.length === 0) return [];
                return [(
                  <StoryLane
                    key={story.id}
                    story={story}
                    tasks={visibleTasks}
                    projectId={projectId}
                    teamMembers={teamMembers}
                    columns={columns}
                    collapsedColumns={collapsedColumns}
                    draggingTaskId={draggingTaskId}
                    onDragStart={setDraggingTaskId}
                    onDragEnd={() => setDraggingTaskId(null)}
                    onTaskStatusChange={onTaskStatusChange}
                    onTaskEffortChange={onTaskEffortChange}
                    onTaskOpen={(task) => setSelectedTaskCtx({ task, workflowId: story.id, storyName: story.name })}
                  />
                )];
              })
            )
          ) : (
            memberLanes
              .filter((member) => {
                if (taskFilter === "all") return true;
                if (taskFilter === "mine") return member !== null && member.user.id === user?.id;
                return member !== null && member.user.id === taskFilter;
              })
              .map((member) => (
                <MemberLane
                  key={member ? member.user.id : "__unassigned__"}
                  member={member}
                  allStoryTasks={storyTasks}
                  stories={stories}
                  teamMembers={teamMembers}
                  columns={columns}
                  collapsedColumns={collapsedColumns}
                  draggingTaskId={draggingTaskId}
                  onDragStart={setDraggingTaskId}
                  onDragEnd={() => setDraggingTaskId(null)}
                  onTaskStatusChange={onTaskStatusChange}
                  onTaskEffortChange={onTaskEffortChange}
                  onTaskOpen={(task, workflowId, storyName) => setSelectedTaskCtx({ task, workflowId, storyName })}
                />
            ))
          )}
        </div>
      </div>

        {/* Research panel */}
        {researchOpen && (
          <div className="w-96 shrink-0 overflow-hidden border-l border-slate-200">
            <ResearchPanel
              token={token ?? ""}
              entityType={selectedTaskCtx ? "task" : "job"}
              entityId={selectedTaskCtx ? selectedTaskCtx.task.id : jobId}
              storyId={selectedTaskCtx?.workflowId}
              storyTitle={selectedTaskCtx?.storyName}
              taskId={selectedTaskCtx?.task.id}
              taskTitle={selectedTaskCtx?.task.name}
              onClose={() => setResearchOpen(false)}
            />
          </div>
        )}
      </div>

      {selectedTaskCtx && (
        <TaskDetailModal
          task={selectedTaskCtx.task}
          workflowId={selectedTaskCtx.workflowId}
          storyName={selectedTaskCtx.storyName}
          teamMembers={teamMembers}
          token={token!}
          onTaskUpdated={onTaskUpdated}
          onClose={() => setSelectedTaskCtx(null)}
        />
      )}
    </div>
  );
}

// ── Story Lane ────────────────────────────────────────────────────────────────

function StoryLane({
  story,
  tasks,
  projectId,
  teamMembers,
  columns,
  collapsedColumns,
  draggingTaskId,
  onDragStart,
  onDragEnd,
  onTaskStatusChange,
  onTaskEffortChange,
  onTaskOpen,
}: {
  story: Workflow;
  tasks: Task[];
  projectId: string;
  teamMembers: TeamMember[];
  columns: (typeof TASK_COLUMNS[number] & { label: string })[];
  collapsedColumns: Set<Status>;
  draggingTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onTaskStatusChange: (taskId: string, workflowId: string, status: Status) => void;
  onTaskEffortChange: (taskId: string, workflowId: string, effort: number | null) => void;
  onTaskOpen: (task: Task) => void;
}) {
  const t = useTranslations("board");
  const done = tasks.filter((t) => t.status === "Complete").length;
  // Derive total effort from task efforts; fall back to story.story_points if no tasks have effort yet
  const taskEffortTotal = tasks.reduce((s, t) => s + (t.effort ?? 0), 0);
  const displayPoints = taskEffortTotal > 0 ? taskEffortTotal : story.story_points;

  return (
    <div className="flex mb-2 items-stretch">
      {/* Story label */}
      <div className="w-48 shrink-0 flex flex-col justify-start pt-2 pr-3">
        <Link
          href={`/projects/${projectId}/stories/${story.id}`}
          className="text-sm font-semibold text-slate-700 hover:text-violet-700 transition-colors leading-snug line-clamp-2"
        >
          {story.name}
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {displayPoints != null && (
            <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded-full">
              {displayPoints} pts
            </span>
          )}
          <span className="text-xs text-slate-400">
            {tasks.length === 0 ? t("noTasks") : t("taskSummary", { done, total: tasks.length })}
          </span>
        </div>
      </div>

      {/* Column cells */}
      {columns.map((col) => (
        <SwimCell
          key={col.status}
          column={col}
          tasks={tasks.filter((t) => t.status === col.status)}
          workflowId={story.id}
          teamMembers={teamMembers}
          showStoryName={false}
          storyName={story.name}
          collapsed={collapsedColumns.has(col.status)}
          draggingTaskId={draggingTaskId}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={(taskId) => onTaskStatusChange(taskId, story.id, col.status)}
          onTaskEffortChange={(taskId, effort) => onTaskEffortChange(taskId, story.id, effort)}
          onTaskOpen={onTaskOpen}
        />
      ))}
    </div>
  );
}

// ── Member Lane ───────────────────────────────────────────────────────────────

function MemberLane({
  member,
  allStoryTasks,
  stories,
  teamMembers,
  columns,
  collapsedColumns,
  draggingTaskId,
  onDragStart,
  onDragEnd,
  onTaskStatusChange,
  onTaskEffortChange,
  onTaskOpen,
}: {
  member: TeamMember | null;
  allStoryTasks: Record<string, Task[]>;
  stories: Workflow[];
  teamMembers: TeamMember[];
  columns: (typeof TASK_COLUMNS[number] & { label: string })[];
  collapsedColumns: Set<Status>;
  draggingTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onTaskStatusChange: (taskId: string, workflowId: string, status: Status) => void;
  onTaskEffortChange: (taskId: string, workflowId: string, effort: number | null) => void;
  onTaskOpen: (task: Task, workflowId: string, storyName: string) => void;
}) {
  const t = useTranslations("board");
  const laneLabel = member
    ? (`${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username)
    : t("unassigned");

  // All tasks for this member across all stories, with their workflow id
  const memberTasks: { task: Task; workflowId: string; storyName: string }[] = stories.flatMap((story) =>
    (allStoryTasks[story.id] ?? [])
      .filter((t) => member ? t.assigned_to === member.user.id : !t.assigned_to)
      .map((task) => ({ task, workflowId: story.id, storyName: story.name }))
  );

  return (
    <div className="flex mb-2 items-stretch">
      {/* Member label */}
      <div className="w-48 shrink-0 flex items-start gap-2 pt-2 pr-3">
        {member ? (
          <MemberAvatar member={member} size="md" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-slate-400">
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z" />
            </svg>
          </div>
        )}
        <span className="text-xs font-medium text-slate-600 leading-tight pt-0.5">{laneLabel}</span>
      </div>

      {/* Column cells */}
      {columns.map((col) => {
        const colItems = memberTasks.filter(({ task }) => task.status === col.status);
        const wfMap = Object.fromEntries(colItems.map(({ task, workflowId }) => [task.id, workflowId]));
        return (
          <SwimCell
            key={col.status}
            column={col}
            tasks={colItems.map(({ task }) => task)}
            workflowId=""
            teamMembers={teamMembers}
            showStoryName
            storyName=""
            storyNameMap={Object.fromEntries(colItems.map(({ task, storyName }) => [task.id, storyName]))}
            collapsed={collapsedColumns.has(col.status)}
            draggingTaskId={draggingTaskId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={(taskId) => { const wfId = wfMap[taskId]; if (wfId) onTaskStatusChange(taskId, wfId, col.status); }}
            onTaskEffortChange={(taskId, effort) => { const wfId = wfMap[taskId]; if (wfId) onTaskEffortChange(taskId, wfId, effort); }}
            onTaskOpen={(task) => { const wfId = wfMap[task.id]; const sn = Object.fromEntries(colItems.map(({ task: ct, storyName }) => [ct.id, storyName]))[task.id] ?? ""; if (wfId) onTaskOpen(task, wfId, sn); }}
          />
        );
      })}
    </div>
  );
}

// ── Swim Cell ─────────────────────────────────────────────────────────────────

function SwimCell({
  column,
  tasks,
  workflowId,
  teamMembers,
  showStoryName,
  storyName,
  storyNameMap,
  collapsed,
  draggingTaskId,
  onDragStart,
  onDragEnd,
  onDrop,
  onTaskEffortChange,
  onTaskOpen,
}: {
  column: typeof TASK_COLUMNS[number] & { label: string };
  tasks: Task[];
  workflowId: string;
  teamMembers: TeamMember[];
  showStoryName: boolean;
  storyName: string;
  storyNameMap?: Record<string, string>;
  collapsed?: boolean;
  draggingTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (taskId: string) => void;
  onTaskEffortChange: (taskId: string, effort: number | null) => void;
  onTaskOpen: (task: Task) => void;
}) {
  const t = useTranslations("board");
  const [isOver, setIsOver] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); dragCounter.current++; setIsOver(true); }
  function handleDragLeave() { dragCounter.current--; if (dragCounter.current === 0) setIsOver(false); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); dragCounter.current = 0; setIsOver(false);
    const id = e.dataTransfer.getData("taskId");
    const taskType = e.dataTransfer.getData("taskType");
    if (id && taskType !== "automated") onDrop(id);
  }

  const dragHandlers = { onDragEnter: handleDragEnter, onDragLeave: handleDragLeave, onDragOver: handleDragOver, onDrop: handleDrop };

  if (collapsed) {
    const overClass = isOver ? `border-2 ${column.overBorder}` : `border ${column.bg} ${column.border}`;
    return (
      <div
        className={`w-56 shrink-0 mx-1 rounded-b-lg rounded-tr-lg min-h-8 px-3 py-2 transition-colors flex items-center justify-center ${overClass}`}
        {...dragHandlers}
      >
        {tasks.length > 0 ? (
          <span className={`text-xs font-medium ${column.header} opacity-60`}>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} hidden
          </span>
        ) : (
          isOver && <p className="text-xs text-center text-violet-400">{t("dropHere")}</p>
        )}
      </div>
    );
  }

  const cellClass = isOver
    ? `border-2 ${column.overBorder}`
    : `border ${column.bg} ${column.border}`;

  return (
    <div
      className={`w-56 shrink-0 mx-1 rounded-b-lg rounded-tr-lg min-h-16 p-1.5 space-y-1.5 transition-colors ${cellClass}`}
      {...dragHandlers}
    >
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          teamMembers={teamMembers}
          showStoryName={showStoryName}
          storyName={storyNameMap ? (storyNameMap[task.id] ?? storyName) : storyName}
          isDragging={draggingTaskId === task.id}
          isDraggingActive={draggingTaskId !== null}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onEffortChange={(effort) => onTaskEffortChange(task.id, effort)}
          onOpen={() => onTaskOpen(task)}
        />
      ))}
      {tasks.length === 0 && isOver && (
        <p className="text-xs text-center py-3 text-violet-400">{t("dropHere")}</p>
      )}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  teamMembers,
  showStoryName,
  storyName,
  isDragging,
  isDraggingActive,
  onDragStart,
  onDragEnd,
  onEffortChange,
  onOpen,
}: {
  task: Task;
  teamMembers: TeamMember[];
  showStoryName: boolean;
  storyName: string;
  isDragging: boolean;
  isDraggingActive: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onEffortChange: (effort: number | null) => void;
  onOpen: () => void;
}) {
  const [editingEffort, setEditingEffort] = useState(false);
  const [effortDraft, setEffortDraft] = useState("");
  const effortInputRef = useRef<HTMLInputElement>(null);
  const assignee = task.assigned_to ? teamMembers.find((m) => m.user.id === task.assigned_to) : null;

  const isAutomated = task.task_type === "automated";
  const isDecisionReady = task.task_type === "decision" && task.status === "Ready";

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.setData("taskType", task.task_type);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => onDragStart(task.id));
  }

  function startEffortEdit(e: React.MouseEvent) {
    e.stopPropagation(); // don't bubble to the card's onClick (open modal)
    setEffortDraft(task.effort != null ? String(task.effort) : "");
    setEditingEffort(true);
    setTimeout(() => effortInputRef.current?.select(), 0);
  }

  function commitEffort() {
    setEditingEffort(false);
    const parsed = parseInt(effortDraft, 10);
    const newEffort = effortDraft.trim() === "" ? null : isNaN(parsed) || parsed < 0 ? task.effort : parsed;
    if (newEffort !== task.effort) onEffortChange(newEffort ?? null);
  }

  const cardBase = isAutomated
    ? `bg-slate-50 rounded-md border-l-2 border border-slate-300 p-2 shadow-sm select-none transition-all cursor-default
       ${task.status === "In Progress" ? "border-l-amber-400 animate-pulse-border" : "border-l-slate-400"}
       ${isDraggingActive ? "opacity-70" : "hover:shadow-md hover:border-slate-400"}`
    : isDecisionReady
    ? `bg-white rounded-md border-2 border-indigo-300 p-2 shadow-sm select-none transition-all cursor-grab
       ${isDragging ? "opacity-40 shadow-none cursor-grabbing"
         : isDraggingActive ? "opacity-90"
         : "hover:shadow-md hover:border-indigo-400"}`
    : `bg-white rounded-md border p-2 shadow-sm select-none transition-all cursor-grab
       ${isDragging ? "opacity-40 border-violet-300 shadow-none cursor-grabbing"
         : isDraggingActive ? "border-slate-200 opacity-90"
         : "border-slate-200 hover:shadow-md hover:border-violet-200"}`;

  return (
    <div
      draggable={!isAutomated}
      onDragStart={isAutomated ? undefined : handleDragStart}
      onDragEnd={isAutomated ? undefined : onDragEnd}
      onClick={onOpen}
      className={cardBase}
    >
      {/* Story name (member mode) */}
      {showStoryName && storyName && (
        <p className="text-[10px] text-slate-400 font-medium leading-tight mb-1 truncate">{storyName}</p>
      )}

      {/* Task name + badges row */}
      <div className="flex items-start gap-1 mb-1.5">
        <p className={`flex-1 text-xs font-medium leading-snug ${isAutomated ? "text-slate-500" : "text-slate-700"}`}>{task.name}</p>
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {task.is_start && (
            <span title="Start task" className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg viewBox="0 0 8 8" fill="currentColor" className="w-2 h-2 text-emerald-600">
                <polygon points="1,0 7,4 1,8" />
              </svg>
            </span>
          )}
          {task.is_end && (
            <span title="End task" className="w-3.5 h-3.5 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-sm bg-slate-500 block" />
            </span>
          )}
          {task.task_type === "decision" && (
            <span title="Decision" className="text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold leading-none">
              {isDecisionReady ? "⬦ Decide" : "D"}
            </span>
          )}
          {task.task_type === "automated" && (
            <span title="Automated — system managed" className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-semibold leading-none flex items-center gap-0.5">
              <svg viewBox="0 0 12 12" fill="currentColor" className="w-2 h-2">
                <path d="M6 0a6 6 0 1 1 0 12A6 6 0 0 1 6 0Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>
              </svg>
              Auto
            </span>
          )}
          {task.task_type === "loop_block" && (
            <span title="Loop" className="text-[9px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold leading-none">L</span>
          )}
        </div>
      </div>

      {/* Assignee + effort row */}
      <div className="flex items-center justify-between gap-1">
        {assignee ? (
          <div className="flex items-center gap-1 min-w-0">
            <MemberAvatar member={assignee} size="sm" />
            <span className="text-[10px] text-slate-400 truncate">
              {`${assignee.user.first_name ?? ""} ${assignee.user.last_name ?? ""}`.trim() || assignee.user.username}
            </span>
          </div>
        ) : <span />}

        {/* Effort badge — click to edit */}
        {editingEffort ? (
          <input
            ref={effortInputRef}
            type="number"
            min="0"
            value={effortDraft}
            onChange={(e) => setEffortDraft(e.target.value)}
            onBlur={commitEffort}
            onKeyDown={(e) => { if (e.key === "Enter") commitEffort(); if (e.key === "Escape") setEditingEffort(false); }}
            onClick={(e) => e.stopPropagation()}
            className="w-10 text-[10px] font-semibold text-center border border-violet-400 rounded px-1 py-0.5 outline-none bg-white text-violet-700"
          />
        ) : (
          <button
            type="button"
            title="Set effort"
            onClick={startEffortEdit}
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors shrink-0 ${
              task.effort != null
                ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                : "bg-slate-100 text-slate-400 hover:bg-violet-100 hover:text-violet-600"
            }`}
          >
            {task.effort != null ? `${task.effort}p` : "·p"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────

function TaskDetailModal({
  task, workflowId, storyName, teamMembers, token, onTaskUpdated, onClose,
}: {
  task: Task;
  workflowId: string;
  storyName: string;
  teamMembers: TeamMember[];
  token: string;
  onTaskUpdated: (t: Task) => void;
  onClose: () => void;
}) {
  const [draftName, setDraftName] = useState(task.name);
  const [draftDesc, setDraftDesc] = useState(task.description ?? "");
  const [draftAssignee, setDraftAssignee] = useState<string | null>(task.assigned_to ?? null);
  const [draftStatus, setDraftStatus] = useState<Status>(task.status);
  const [draftEffort, setDraftEffort] = useState<string>(task.effort != null ? String(task.effort) : "");
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionLinks, setDecisionLinks] = useState<TaskLink[]>([]);
  const [activeTab, setActiveTab] = useState<"details" | "notes">("details");
  const [modalSize, setModalSize] = useState({ w: 640, h: 580 });
  const resizeRef = useRef<{ dir: string; x0: number; y0: number; w0: number; h0: number } | null>(null);

  // Keep drafts in sync if the task prop changes (e.g. board update while modal is open)
  useEffect(() => {
    setDraftName(task.name);
    setDraftDesc(task.description ?? "");
    setDraftAssignee(task.assigned_to ?? null);
    setDraftStatus(task.status);
    setDraftEffort(task.effort != null ? String(task.effort) : "");
    setActiveTab("details");
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load outgoing links for decision tasks
  useEffect(() => {
    if (task.task_type !== "decision") return;
    listTaskOutgoingLinks(token, task.id).then(setDecisionLinks).catch(() => {});
  }, [task.id, task.task_type, token]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Resize via drag handles
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const dw = e.clientX - r.x0;
      const dh = e.clientY - r.y0;
      setModalSize({
        w: r.dir.includes("e") ? Math.max(480, r.w0 + dw) : r.w0,
        h: r.dir.includes("s") ? Math.max(420, r.h0 + dh) : r.h0,
      });
    }
    function onUp() { resizeRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function startResize(e: React.MouseEvent, dir: string) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { dir, x0: e.clientX, y0: e.clientY, w0: modalSize.w, h0: modalSize.h };
  }

  const isAutomatedTask = task.task_type === "automated";
  const isDirty =
    draftName.trim() !== task.name ||
    draftDesc.trim() !== (task.description ?? "") ||
    draftAssignee !== (task.assigned_to ?? null) ||
    (!isAutomatedTask && draftStatus !== task.status) ||
    (draftEffort.trim() === "" ? null : parseInt(draftEffort, 10)) !== task.effort;

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Parameters<typeof updateTask>[2] = {};
      if (draftName.trim() !== task.name) patch.name = draftName.trim();
      if (draftDesc.trim() !== (task.description ?? "")) patch.description = draftDesc.trim() || undefined;
      if (draftAssignee !== (task.assigned_to ?? null)) patch.assigned_to = draftAssignee;
      if (!isAutomatedTask && draftStatus !== task.status) patch.status = draftStatus;
      const parsedEffort = draftEffort.trim() === "" ? null : parseInt(draftEffort, 10);
      if (parsedEffort !== task.effort) patch.effort = parsedEffort;
      const updated = await updateTask(token, task.id, patch);
      onTaskUpdated(updated);
      onClose();
    } finally { setSaving(false); }
  }

  async function handleDecide(branchLabel: string) {
    setDeciding(true);
    try {
      const updated = await decideTask(token, task.id, branchLabel);
      onTaskUpdated(updated);
      onClose();
    } finally { setDeciding(false); }
  }

  function memberName(m: TeamMember) {
    return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  const taskTypeBadge: Record<string, { label: string; cls: string }> = {
    decision:   { label: "Decision",   cls: "bg-indigo-100 text-indigo-700" },
    automated:  { label: "Automated",  cls: "bg-amber-100 text-amber-700" },
    loop_block: { label: "Loop",       cls: "bg-rose-100 text-rose-700" },
    standard:   { label: "Standard",   cls: "bg-slate-100 text-slate-600" },
  };
  const typeBadge = taskTypeBadge[task.task_type] ?? taskTypeBadge.standard;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col relative select-none"
        style={{ width: modalSize.w, height: modalSize.h, maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Resize handle — right edge */}
        <div onMouseDown={(e) => startResize(e, "e")} className="absolute top-4 right-0 bottom-4 w-1.5 cursor-ew-resize rounded-r-full hover:bg-violet-200 transition-colors z-10" />
        {/* Resize handle — bottom edge */}
        <div onMouseDown={(e) => startResize(e, "s")} className="absolute left-4 right-4 bottom-0 h-1.5 cursor-ns-resize rounded-b-full hover:bg-violet-200 transition-colors z-10" />
        {/* Resize handle — bottom-right corner */}
        <div onMouseDown={(e) => startResize(e, "se")} className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize z-20 flex items-end justify-end pr-1 pb-1">
          <svg viewBox="0 0 8 8" fill="currentColor" className="w-2.5 h-2.5 text-slate-300">
            <path d="M6 2 L6 6 L2 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <path d="M4 4 L6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        {/* Header */}
        <div className="px-6 pt-5 pb-0 border-b border-slate-100">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 mb-1 truncate">{storyName}</p>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full text-lg font-semibold text-slate-800 bg-transparent border-0 outline-none focus:ring-0 p-0 leading-snug"
                placeholder="Task name"
              />
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5 shrink-0">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-0">
            {(["details", "notes"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`text-sm px-4 py-2 font-medium border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {tab === "details" ? "Details" : "Notes"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 flex flex-col">
          {activeTab === "notes" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <NotesPanel
                entityType="task"
                entityId={task.id}
                isTeam={true}
                members={teamMembers.map((m) => m.user)}
              />
            </div>
          ) : (<>
          {/* Row: Status · Type · Start/End badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.task_type === "automated" ? (
              <span className="text-xs font-medium border border-slate-200 rounded-full px-3 py-1 bg-slate-50 text-slate-500 cursor-default select-none" title="Automated tasks are managed by the system">
                {task.status}
              </span>
            ) : (
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as Status)}
                className="text-xs font-medium border border-slate-200 rounded-full px-3 py-1 bg-white text-slate-700 outline-none focus:border-violet-400 cursor-pointer"
              >
                {(["Not Started", "Ready", "In Progress", "On Hold", "Complete", "Cancelled"] as Status[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeBadge.cls}`}>{typeBadge.label}</span>
            {task.is_start && (
              <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                <svg viewBox="0 0 8 8" fill="currentColor" className="w-2 h-2"><polygon points="1,0 7,4 1,8" /></svg>
                Start
              </span>
            )}
            {task.is_end && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">End</span>
            )}
            {task.task_type === "automated" && (
              <span className="text-xs text-slate-400 italic">System managed — cannot be moved manually</span>
            )}
          </div>

          {/* Decision UI — shown when task is a decision in Ready state */}
          {task.task_type === "decision" && task.status === "Ready" && (
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
              <p className="text-sm font-semibold text-indigo-800 mb-1">⬦ Decision required</p>
              <p className="text-xs text-indigo-600 mb-3">Select the appropriate outcome to route this workflow:</p>
              {decisionLinks.filter((l) => l.branch_label).length === 0 ? (
                <p className="text-xs text-indigo-400 italic">No outgoing labels configured for this decision task.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {decisionLinks
                    .filter((l) => l.branch_label)
                    .map((l) => (
                      <button
                        key={l.branch_label}
                        type="button"
                        disabled={deciding}
                        onClick={() => handleDecide(l.branch_label!)}
                        className="px-4 py-2 rounded-lg bg-white border-2 border-indigo-300 text-sm font-semibold text-indigo-700
                          hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {l.branch_label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Show recorded outcome for decided tasks */}
          {task.task_type === "decision" && task.decision_outcome && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-indigo-700">Decided:</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{task.decision_outcome}</span>
            </div>
          )}

          {/* Row: Assignee · Effort */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assignee</label>
              <select
                value={draftAssignee ?? ""}
                onChange={(e) => setDraftAssignee(e.target.value || null)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>{memberName(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Effort (pts)</label>
              <input
                type="number"
                min="0"
                value={draftEffort}
                onChange={(e) => setDraftEffort(e.target.value)}
                placeholder="—"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={4}
              placeholder="Add a description…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none focus:border-violet-400 resize-none"
            />
          </div>
          </>)}
        </div>

        {/* Footer — only show save/cancel when on Details tab */}
        {activeTab === "details" && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// ── Member Avatar ─────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = "sm" }: { member: TeamMember; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();
  const label = `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username;
  const dim = size === "md" ? "w-7 h-7 text-[11px]" : "w-5 h-5 text-[9px]";

  const avatar = (member.user.avatar_url && !broken) ? (
    <img
      src={member.user.avatar_url}
      alt={initials}
      className={`${dim} rounded-full object-cover`}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className={`${dim} rounded-full bg-violet-100 text-violet-700 font-semibold flex items-center justify-center select-none`}>
      {initials}
    </span>
  );

  return (
    <div className="relative group inline-flex shrink-0">
      {avatar}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white whitespace-nowrap shadow-lg">
          {label}
        </div>
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
