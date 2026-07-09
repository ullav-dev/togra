"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserTeamRoleNames } from "@/lib/auth-api";
import {
  listWorkflows,
  listTasks,
  updateTask,
  assignTaskTeamRole,
  removeTaskTeamRole,
  listTaskTeamRoles,
  getTeam,
  listTeamRoles,
} from "@/lib/awe-api";
import type { Job, Workflow, Task, TeamMember, TeamRole, Status } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import RefreshControl from "@/components/RefreshControl";
import NotesPanel from "@/components/notes/NotesPanel";
import PortValuesEditor from "@/components/workflow/PortValuesEditor";
import { taskRef, workflowRef } from "@/lib/reference";

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-slate-100 text-slate-500",
  none: "bg-slate-50 text-slate-400",
};

type SortKey = "task" | "story" | "priority" | "effort" | "due" | "allocated" | "status";
type SortDir = "asc" | "desc";
type FilterMode = "all" | "mine";

// Only Task and Story are resizable — the other columns hold short, fixed-shape
// content (pills, dates, avatars) that doesn't benefit from resizing.
type ResizableKey = "task" | "story";

const DEFAULT_COL_WIDTHS: Record<ResizableKey, number> = {
  task: 240,
  story: 176,
};

// Fixed widths (Tailwind classes) for the non-resizable columns, shared between
// the header and each TaskRow so they stay aligned.
const FIXED_COL_CLASS: Record<Exclude<SortKey, ResizableKey>, string> = {
  priority: "w-28",
  effort: "w-20",
  due: "w-32",
  allocated: "w-40",
  status: "w-32",
};

const MIN_COL_WIDTH = 70;

function useColumnResize(initial: Record<ResizableKey, number>) {
  const [widths, setWidths] = useState(initial);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const startResize = useCallback((key: ResizableKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widthsRef.current[key];

    function onMove(ev: MouseEvent) {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { widths, startResize };
}

function ColumnResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-violet-300/60 transition-colors"
    />
  );
}

interface Props {
  job: Job;
  projectId: string;
  projectCode: string | null;
  /** Fallback team when the job itself has no team_id (e.g. Kanban jobs commonly rely on the project's team). */
  projectTeamId: string | null;
}

interface Row {
  task: Task;
  story: Workflow;
  roles: TeamRole[];
}

export default function KanbanBoard({ job, projectId, projectCode, projectTeamId }: Props) {
  const t = useTranslations("board");
  const { token, user } = useAuth();
  const teamId = job.team_id ?? projectTeamId ?? null;

  const [stories, setStories] = useState<Workflow[]>([]);
  const [storyTasks, setStoryTasks] = useState<Record<string, Task[]>>({});
  const [taskRoleIds, setTaskRoleIds] = useState<Record<string, string[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterMode, setFilterMode] = useState<FilterMode>("mine");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [takingId, setTakingId] = useState<string | null>(null);
  const promotedRef = useRef(false);
  const { widths: colWidths, startResize } = useColumnResize(DEFAULT_COL_WIDTHS);

  const userRoleNames = getUserTeamRoleNames(token, teamId);

  const loadData = useCallback(async () => {
    if (!token) return;
    const wfs = await listWorkflows(token, { job_id: job.id });
    setStories(wfs);
    const results = await Promise.all(
      wfs.map((s) => listTasks(token, s.id).then((tasks) => ({ id: s.id, tasks })))
    );
    const nextStoryTasks: Record<string, Task[]> = {};
    results.forEach(({ id, tasks }) => { nextStoryTasks[id] = tasks; });
    setStoryTasks(nextStoryTasks);

    const allTasks = results.flatMap((r) => r.tasks);
    const roleResults = await Promise.all(
      allTasks.map((task) =>
        listTaskTeamRoles(token, task.id)
          .then((links) => ({ id: task.id, roleIds: links.map((l) => l.team_role_id) }))
          .catch(() => ({ id: task.id, roleIds: [] as string[] }))
      )
    );
    const nextTaskRoleIds: Record<string, string[]> = {};
    roleResults.forEach(({ id, roleIds }) => { nextTaskRoleIds[id] = roleIds; });
    setTaskRoleIds(nextTaskRoleIds);
  }, [token, job.id]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      let roles: TeamRole[] = [];
      if (teamId) {
        roles = await listTeamRoles(token, teamId).catch(() => []);
        setTeamRoles(roles);
        const team = await getTeam(token, teamId).catch(() => null);
        if (team) setTeamMembers(team.members.filter((m) => m.status === "active"));
      }
      await loadData();
    })().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, job.id, teamId]);

  // Promote is_start tasks from Not Started → Ready (once per board load)
  useEffect(() => {
    if (!token || promotedRef.current) return;
    const allTasks = Object.values(storyTasks).flat();
    if (allTasks.length === 0) return;
    const toPromote = allTasks.filter((tsk) => tsk.is_start && tsk.status === "Not Started");
    if (toPromote.length === 0) { promotedRef.current = true; return; }
    promotedRef.current = true;
    Promise.all(toPromote.map((tsk) => updateTask(token, tsk.id, { status: "Ready" })))
      .then((updated) => {
        setStoryTasks((prev) => {
          const next = { ...prev };
          updated.forEach((u) => {
            if (next[u.workflow_id]) {
              next[u.workflow_id] = next[u.workflow_id].map((tsk) => tsk.id === u.id ? u : tsk);
            }
          });
          return next;
        });
      })
      .catch(() => {});
  }, [storyTasks, token]);

  const rows: Row[] = useMemo(() => {
    return stories.flatMap((story) =>
      (storyTasks[story.id] ?? [])
        // Decision and automated tasks are driven by the workflow engine, not
        // groomed/worked by a person — they don't belong on this board.
        .filter((task) => task.task_type !== "decision" && task.task_type !== "automated")
        .map((task) => ({
          task,
          story,
          roles: (taskRoleIds[task.id] ?? []).map((rid) => teamRoles.find((r) => r.id === rid)).filter(Boolean) as TeamRole[],
        }))
    );
  }, [stories, storyTasks, taskRoleIds, teamRoles]);

  function matchesFilter(row: Row): boolean {
    if (filterMode === "all") return true;
    if (row.task.assigned_to === user?.id) return true;
    return row.roles.some((r) => userRoleNames.includes(r.name));
  }

  function allocatedLabel(row: Row): string {
    if (row.roles.length > 0) return row.roles.map((r) => r.name).join(", ");
    if (row.task.assigned_to) {
      const m = teamMembers.find((mm) => mm.user.id === row.task.assigned_to);
      if (m) return [m.user.first_name, m.user.last_name].filter(Boolean).join(" ") || m.user.username;
    }
    return "";
  }

  function sortValue(row: Row): string | number {
    switch (sortBy) {
      case "task": return row.task.name.toLowerCase();
      case "story": return row.story.name.toLowerCase();
      case "priority": return PRIORITY_RANK[row.task.priority ?? "none"] ?? 99;
      case "effort": return row.task.effort ?? -1;
      case "due": return row.task.due_time ? new Date(row.task.due_time).getTime() : Number.MAX_SAFE_INTEGER;
      case "allocated": return allocatedLabel(row).toLowerCase();
      case "status": return row.task.status;
    }
  }

  const sorted = useMemo(() => {
    const filtered = rows.filter(matchesFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filterMode, sortBy, sortDir, teamMembers, userRoleNames]);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  async function handleQuickPick(task: Task) {
    if (!token || !user) return;
    setTakingId(task.id);
    try {
      const updated = await updateTask(token, task.id, { assigned_to: user.id, status: "In Progress" });
      setStoryTasks((prev) => ({
        ...prev,
        [updated.workflow_id]: (prev[updated.workflow_id] ?? []).map((tsk) => tsk.id === updated.id ? updated : tsk),
      }));
    } finally {
      setTakingId(null);
    }
  }

  async function handleAssignToUser(task: Task, userId: string) {
    if (!token) return;
    const updated = await updateTask(token, task.id, { assigned_to: userId });
    setStoryTasks((prev) => ({
      ...prev,
      [updated.workflow_id]: (prev[updated.workflow_id] ?? []).map((tsk) => tsk.id === updated.id ? updated : tsk),
    }));
    setTaskRoleIds((prev) => ({ ...prev, [task.id]: [] }));
    const existing = await listTaskTeamRoles(token, task.id);
    await Promise.all(existing.map((r) => removeTaskTeamRole(token, task.id, r.team_role_id)));
  }

  async function handleAssignToRole(task: Task, roleId: string) {
    if (!token) return;
    const updated = await updateTask(token, task.id, { assigned_to: null });
    setStoryTasks((prev) => ({
      ...prev,
      [updated.workflow_id]: (prev[updated.workflow_id] ?? []).map((tsk) => tsk.id === updated.id ? updated : tsk),
    }));
    const existing = await listTaskTeamRoles(token, task.id);
    await Promise.all(existing.map((r) => removeTaskTeamRole(token, task.id, r.team_role_id)));
    await assignTaskTeamRole(token, task.id, roleId);
    setTaskRoleIds((prev) => ({ ...prev, [task.id]: [roleId] }));
  }

  function onTaskUpdated(updated: Task) {
    setStoryTasks((prev) => ({
      ...prev,
      [updated.workflow_id]: (prev[updated.workflow_id] ?? []).map((tsk) => tsk.id === updated.id ? updated : tsk),
    }));
  }

  const openRow = openTaskId ? rows.find((r) => r.task.id === openTaskId) ?? null : null;

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("loading")}</div>;

  const columns: { key: SortKey; label: string }[] = [
    { key: "task", label: t("kanbanBoard.colTask") },
    { key: "story", label: t("kanbanBoard.colStory") },
    { key: "priority", label: t("kanbanBoard.colPriority") },
    { key: "effort", label: t("kanbanBoard.colEffort") },
    { key: "due", label: t("kanbanBoard.colDue") },
    { key: "allocated", label: t("kanbanBoard.colAllocated") },
    { key: "status", label: t("kanbanBoard.colStatus") },
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Controls bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
              filterMode === "all" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t("kanbanBoard.filterAll")}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("mine")}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
              filterMode === "mine" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-teal-700"
            }`}
          >
            {t("kanbanBoard.filterMine")}
          </button>
        </div>

        <div className="ml-auto">
          <RefreshControl onRefresh={loadData} />
        </div>
      </div>

      {/* Task table */}
      {sorted.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">{filterMode === "mine" ? t("kanbanBoard.noTasksMine") : t("kanbanBoard.noTasksAll")}</p>
        </div>
      ) : (
        <div className="w-full border border-slate-200 rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="flex items-stretch bg-slate-50 border-b border-slate-200 px-3 py-2">
            {columns.map((col) => {
              const resizable = col.key === "task" || col.key === "story";
              return (
                <div
                  key={col.key}
                  className={`relative pr-2 min-w-0 ${resizable ? "" : `shrink-0 ${FIXED_COL_CLASS[col.key as Exclude<SortKey, ResizableKey>]}`}`}
                  style={resizable ? { flexGrow: 1, flexShrink: 1, flexBasis: colWidths[col.key as ResizableKey] } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-teal-700 transition-colors truncate"
                  >
                    {col.label}
                    {sortBy === col.key && (
                      <span className="text-teal-600">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </button>
                  {resizable && <ColumnResizeHandle onMouseDown={startResize(col.key as ResizableKey)} />}
                </div>
              );
            })}
            <div className="shrink-0" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {sorted.map((row) => (
              <TaskRow
                key={row.task.id}
                row={row}
                projectId={projectId}
                projectCode={projectCode}
                colWidths={colWidths}
                teamMembers={teamMembers}
                teamRoles={teamRoles}
                currentUserId={user?.id ?? null}
                taking={takingId === row.task.id}
                reassignOpen={reassignTaskId === row.task.id}
                onOpenReassign={() => setReassignTaskId(row.task.id)}
                onCloseReassign={() => setReassignTaskId(null)}
                onOpenDetail={() => setOpenTaskId(row.task.id)}
                onQuickPick={() => handleQuickPick(row.task)}
                onAssignToUser={(uid) => handleAssignToUser(row.task, uid)}
                onAssignToRole={(rid) => handleAssignToRole(row.task, rid)}
              />
            ))}
          </div>
        </div>
      )}

      {openRow && (
        <TaskDetailModal
          task={openRow.task}
          projectCode={projectCode}
          storyName={openRow.story.name}
          roles={openRow.roles}
          teamMembers={teamMembers}
          teamRoles={teamRoles}
          onTaskUpdated={onTaskUpdated}
          onRolesUpdated={(roleIds) => setTaskRoleIds((prev) => ({ ...prev, [openRow.task.id]: roleIds }))}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

// ── Task row ────────────────────────────────────────────────────────────────

function formatDue(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" }) {
  const { first_name, username, avatar_url } = member.user;
  const initials = (first_name?.[0] ?? username[0]).toUpperCase();
  const dim = size === "sm" ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-xs";
  return avatar_url ? (
    <img
      src={avatar_url}
      alt={username}
      className={`${dim} rounded-full object-cover`}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  ) : (
    <div className={`${dim} rounded-full bg-violet-100 text-violet-700 font-semibold flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  );
}

function TaskRow({
  row,
  projectId,
  projectCode,
  colWidths,
  teamMembers,
  teamRoles,
  currentUserId,
  taking,
  reassignOpen,
  onOpenReassign,
  onCloseReassign,
  onOpenDetail,
  onQuickPick,
  onAssignToUser,
  onAssignToRole,
}: {
  row: Row;
  projectId: string;
  projectCode: string | null;
  colWidths: Record<ResizableKey, number>;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  currentUserId: string | null;
  taking: boolean;
  reassignOpen: boolean;
  onOpenReassign: () => void;
  onCloseReassign: () => void;
  onOpenDetail: () => void;
  onQuickPick: () => Promise<void>;
  onAssignToUser: (uid: string) => Promise<void>;
  onAssignToRole: (rid: string) => Promise<void>;
}) {
  const t = useTranslations("board");
  const reassignRef = useRef<HTMLDivElement>(null);
  const { task, story, roles } = row;
  const overdue = task.due_time != null && task.status !== "Complete" && task.status !== "Cancelled" && new Date(task.due_time).getTime() < Date.now();

  useEffect(() => {
    if (!reassignOpen) return;
    const handler = (e: MouseEvent) => {
      if (reassignRef.current && !reassignRef.current.contains(e.target as Node)) onCloseReassign();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reassignOpen, onCloseReassign]);

  const assignedMember = task.assigned_to ? teamMembers.find((m) => m.user.id === task.assigned_to) : null;
  const isAllocated = !!(task.assigned_to || roles.length > 0);
  const priority = task.priority ?? "none";

  return (
    <div
      className="flex items-center px-3 py-2.5 transition-colors cursor-pointer hover:bg-teal-50/50"
      onClick={onOpenDetail}
    >
      {/* Task name */}
      <div className="pr-2 min-w-0" style={{ flexGrow: 1, flexShrink: 1, flexBasis: colWidths.task }}>
        <p className="text-sm font-medium leading-snug truncate text-slate-800">
          {taskRef(projectCode, task.task_number) && (
            <span className="text-slate-400 font-normal mr-1">{taskRef(projectCode, task.task_number)}</span>
          )}
          {task.name}
        </p>
      </div>

      {/* Story */}
      <div className="pr-2 min-w-0" style={{ flexGrow: 1, flexShrink: 1, flexBasis: colWidths.story }}>
        <Link
          href={`/projects/${projectId}/stories/${story.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-slate-500 hover:text-teal-700 transition-colors truncate block"
        >
          {workflowRef(projectCode, story.workflow_number) && (
            <span className="text-slate-400 mr-1">{workflowRef(projectCode, story.workflow_number)}</span>
          )}
          {story.name}
        </Link>
      </div>

      {/* Priority */}
      <div className={`shrink-0 pr-2 ${FIXED_COL_CLASS.priority}`}>
        {priority !== "none" ? (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.none}`}>
            {priority}
          </span>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </div>

      {/* Effort */}
      <div className={`shrink-0 pr-2 ${FIXED_COL_CLASS.effort}`}>
        {task.effort != null ? (
          <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-1.5 py-0.5 rounded-full">{task.effort}p</span>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </div>

      {/* Due */}
      <div className={`shrink-0 pr-2 text-xs ${FIXED_COL_CLASS.due} ${overdue ? "text-red-600 font-medium" : "text-slate-500"}`}>
        {formatDue(task.due_time)}
      </div>

      {/* Allocated */}
      <div className={`shrink-0 pr-2 min-w-0 ${FIXED_COL_CLASS.allocated}`}>
        {isAllocated ? (
          <div className="flex items-center gap-1.5 min-w-0">
            {assignedMember && <MemberAvatar member={assignedMember} size="sm" />}
            {roles.map((role) => (
              <span key={role.id} className="text-[11px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium truncate">
                {role.name}
              </span>
            ))}
            {assignedMember && (
              <span className="text-xs text-slate-500 truncate">
                {[assignedMember.user.first_name, assignedMember.user.last_name].filter(Boolean).join(" ") || assignedMember.user.username}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 italic">{t("kanbanBoard.unallocated")}</span>
        )}
      </div>

      {/* Status */}
      <div className={`shrink-0 pr-2 ${FIXED_COL_CLASS.status}`}>
        <StatusPill status={task.status} />
      </div>

      {/* Actions — sized to its own buttons, not stretched to a fixed box */}
      <div className="shrink-0 flex items-center justify-end gap-2">
        {task.status === "Ready" && task.assigned_to !== currentUserId && (
          <button
            type="button"
            disabled={taking}
            onClick={(e) => { e.stopPropagation(); onQuickPick(); }}
            className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {t("kanbanBoard.quickPick")}
          </button>
        )}
        <div className="relative" ref={reassignRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); reassignOpen ? onCloseReassign() : onOpenReassign(); }}
            className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
          >
            {t("kanbanBoard.reassign")}
          </button>
          {reassignOpen && (
            <ReassignPopover
              teamMembers={teamMembers}
              teamRoles={teamRoles}
              onAssignUser={(uid) => { onAssignToUser(uid); onCloseReassign(); }}
              onAssignRole={(rid) => { onAssignToRole(rid); onCloseReassign(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reassign popover ──────────────────────────────────────────────────────────

function ReassignPopover({
  teamMembers,
  teamRoles,
  onAssignUser,
  onAssignRole,
}: {
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  onAssignUser: (uid: string) => void;
  onAssignRole: (rid: string) => void;
}) {
  const t = useTranslations("board");
  return (
    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30" onClick={(e) => e.stopPropagation()}>
      {teamMembers.length > 0 && (
        <>
          <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("kanbanBoard.members")}</p>
          {teamMembers.map((m) => {
            const name = [m.user.first_name, m.user.last_name].filter(Boolean).join(" ") || m.user.username;
            return (
              <button
                key={m.user.id}
                type="button"
                onClick={() => onAssignUser(m.user.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
              >
                <MemberAvatar member={m} size="sm" />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </>
      )}
      {teamRoles.length > 0 && (
        <>
          {teamMembers.length > 0 && <div className="my-1 border-t border-slate-100" />}
          <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("kanbanBoard.roles")}</p>
          {teamRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => onAssignRole(role.id)}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
            >
              {role.name}
            </button>
          ))}
        </>
      )}
      {teamMembers.length === 0 && teamRoles.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-400">{t("kanbanBoard.noMembers")}</p>
      )}
    </div>
  );
}

// ── Task detail modal (grooming) ─────────────────────────────────────────────

const PRIORITY_OPTIONS = ["none", "low", "medium", "high", "critical"] as const;

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TaskDetailModal({
  task,
  projectCode,
  storyName,
  roles,
  teamMembers,
  teamRoles,
  onTaskUpdated,
  onRolesUpdated,
  onClose,
}: {
  task: Task;
  projectCode: string | null;
  storyName: string;
  roles: TeamRole[];
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  onTaskUpdated: (t: Task) => void;
  onRolesUpdated: (roleIds: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("board");
  const [activeTab, setActiveTab] = useState<"details" | "ports" | "notes">("details");
  const [draftName, setDraftName] = useState(task.name);
  const [draftDesc, setDraftDesc] = useState(task.description ?? "");
  const [draftStatus, setDraftStatus] = useState<Status>(task.status);
  const [draftEffort, setDraftEffort] = useState(task.effort != null ? String(task.effort) : "");
  const [draftPriority, setDraftPriority] = useState(task.priority ?? "none");
  const [draftDue, setDraftDue] = useState(toDatetimeLocal(task.due_time));
  const [draftAssignee, setDraftAssignee] = useState<string | null>(task.assigned_to ?? null);
  const [draftRoleId, setDraftRoleId] = useState<string | null>(roles[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [modalSize, setModalSize] = useState({ w: 640, h: 580 });
  const resizeRef = useRef<{ dir: string; x0: number; y0: number; w0: number; h0: number } | null>(null);
  const { token } = useAuth();

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

  const isDirty =
    draftName.trim() !== task.name ||
    draftDesc.trim() !== (task.description ?? "") ||
    draftStatus !== task.status ||
    (draftEffort.trim() === "" ? null : parseInt(draftEffort, 10)) !== task.effort ||
    draftPriority !== (task.priority ?? "none") ||
    toDatetimeLocal(task.due_time) !== draftDue ||
    draftAssignee !== (task.assigned_to ?? null) ||
    draftRoleId !== (roles[0]?.id ?? null);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    try {
      const patch: Parameters<typeof updateTask>[2] = {};
      if (draftName.trim() !== task.name) patch.name = draftName.trim();
      if (draftDesc.trim() !== (task.description ?? "")) patch.description = draftDesc.trim() || undefined;
      if (draftStatus !== task.status) patch.status = draftStatus;
      const parsedEffort = draftEffort.trim() === "" ? null : parseInt(draftEffort, 10);
      if (parsedEffort !== task.effort) patch.effort = parsedEffort;
      if (draftPriority !== (task.priority ?? "none")) patch.priority = draftPriority;
      const dueIso = draftDue ? new Date(draftDue).toISOString() : null;
      if (dueIso !== task.due_time) patch.due_time = dueIso;
      if (draftAssignee !== (task.assigned_to ?? null)) patch.assigned_to = draftAssignee;

      let updated = task;
      if (Object.keys(patch).length > 0) {
        updated = await updateTask(token, task.id, patch);
        onTaskUpdated(updated);
      }

      if (draftRoleId !== (roles[0]?.id ?? null)) {
        await Promise.all(roles.map((r) => removeTaskTeamRole(token, task.id, r.id)));
        if (draftRoleId) {
          await assignTaskTeamRole(token, task.id, draftRoleId);
          onRolesUpdated([draftRoleId]);
        } else {
          onRolesUpdated([]);
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function memberName(m: TeamMember) {
    return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
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
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-1 truncate">
              {taskRef(projectCode, task.task_number) && <span className="font-mono mr-1">{taskRef(projectCode, task.task_number)}</span>}
              {storyName}
            </p>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full text-lg font-semibold text-slate-800 bg-transparent border-0 outline-none focus:ring-0 p-0 leading-snug"
              placeholder={t("kanbanBoard.taskNamePlaceholder")}
            />
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5 shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 border-b border-slate-100">
          {(["details", "ports", "notes"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`text-sm px-4 py-2 font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "details" ? t("kanbanBoard.tabDetails") : tab === "ports" ? t("kanbanBoard.tabPorts") : t("kanbanBoard.tabNotes")}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 flex flex-col">
          {activeTab === "notes" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <NotesPanel entityType="task" entityId={task.id} isTeam={true} members={teamMembers.map((m) => m.user)} />
            </div>
          ) : activeTab === "ports" ? (
            token && <PortValuesEditor taskId={task.id} token={token} onTaskUpdated={onTaskUpdated} />
          ) : (<>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.statusLabel")}</label>
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as Status)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              >
                {(["Not Started", "Ready", "In Progress", "On Hold", "Complete", "Cancelled"] as Status[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.priorityLabel")}</label>
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400 capitalize"
              >
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.effortLabel")}</label>
              <input
                type="number"
                min="0"
                value={draftEffort}
                onChange={(e) => setDraftEffort(e.target.value)}
                placeholder="—"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.dueLabel")}</label>
              <input
                type="datetime-local"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.assigneeLabel")}</label>
              <select
                value={draftAssignee ?? ""}
                onChange={(e) => { setDraftAssignee(e.target.value || null); if (e.target.value) setDraftRoleId(null); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              >
                <option value="">{t("kanbanBoard.unallocated")}</option>
                {teamMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>{memberName(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.roleLabel")}</label>
              <select
                value={draftRoleId ?? ""}
                onChange={(e) => { setDraftRoleId(e.target.value || null); if (e.target.value) setDraftAssignee(null); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:border-violet-400"
              >
                <option value="">{t("kanbanBoard.noRoles")}</option>
                {teamRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("kanbanBoard.descriptionLabel")}</label>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={4}
              placeholder={t("kanbanBoard.descriptionPlaceholder")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none focus:border-violet-400 resize-none"
            />
          </div>
          </>)}
        </div>

        {/* Footer — only shown on the Details tab */}
        {activeTab === "details" && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
            {t("kanbanBoard.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t("kanbanBoard.saving") : t("kanbanBoard.save")}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
