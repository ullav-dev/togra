"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useResize } from "@/hooks/useResize";
import { Link } from "@/i18n/navigation";
import { listWorkflows, listTasks, listTaskTeamRoles, updateTask } from "@/lib/awe-api";
import type { Job, Task, TeamMember, TeamRole, Status } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

// ── Data types ────────────────────────────────────────────────────────────────

interface TaskRow {
  task: Task;
  storyId: string;
  storyName: string;
  sprintId: string;
  sprintName: string;
  roleIds: string[];
  assignedMember: TeamMember | null;
}

interface Props {
  sprints: Job[];
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  token: string;
  projectId: string;
}

type Selection = { type: "role"; id: string } | { type: "member"; id: string } | null;

const STATUSES: Status[] = ["Not Started", "Ready", "In Progress", "On Hold", "Complete"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = "sm" }: { member: TeamMember; size?: "sm" | "xs" }) {
  const [broken, setBroken] = useState(false);
  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();
  const label = memberDisplayName(member);
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-5 h-5 text-[9px]";

  if (member.user.avatar_url && !broken) {
    return <img src={member.user.avatar_url} alt={label} title={label}
      className={`${dim} rounded-full object-cover shrink-0`} onError={() => setBroken(true)} />;
  }
  return (
    <span title={label} className={`${dim} rounded-full bg-violet-100 text-violet-700 font-semibold flex items-center justify-center select-none shrink-0`}>
      {initials}
    </span>
  );
}

function memberDisplayName(m: TeamMember): string {
  return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
}

// ── Task detail panel ─────────────────────────────────────────────────────────

function TaskDetailPanel({
  row,
  teamMembers,
  teamRoles,
  token,
  projectId,
  onClose,
  onTaskUpdated,
}: {
  row: TaskRow;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  token: string;
  projectId: string;
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
}) {
  const t = useTranslations("teamView");
  const [saving, setSaving] = useState(false);
  const task = row.task;

  const roles = row.roleIds
    .map((id) => teamRoles.find((r) => r.id === id))
    .filter(Boolean) as TeamRole[];

  async function handleStatus(status: Status) {
    setSaving(true);
    try {
      const updated = await updateTask(token, task.id, { status });
      onTaskUpdated(updated);
    } finally { setSaving(false); }
  }

  async function handleAssignee(userId: string | null) {
    setSaving(true);
    try {
      const updated = await updateTask(token, task.id, { assigned_to: userId });
      onTaskUpdated(updated);
    } finally { setSaving(false); }
  }

  const activeMembers = teamMembers.filter((m) => m.status === "active");

  return (
    <div className="w-80 shrink-0 border-l border-slate-200 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 leading-snug">{task.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {row.storyName} · {row.sprintName}
          </p>
        </div>
        <button type="button" onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Description */}
        {task.description && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
            <p className="text-sm text-slate-600 leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Status */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t("colStatus")}</label>
          <select
            value={task.status}
            onChange={(e) => void handleStatus(e.target.value as Status)}
            disabled={saving}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Assignee */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t("colAssignee")}</label>
          <div className="flex items-center gap-2">
            {row.assignedMember && <MemberAvatar member={row.assignedMember} size="xs" />}
            <select
              value={task.assigned_to ?? ""}
              onChange={(e) => void handleAssignee(e.target.value || null)}
              disabled={saving}
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50"
            >
              <option value="">{t("unassigned")}</option>
              {activeMembers.map((m) => (
                <option key={m.user.id} value={m.user.id}>{memberDisplayName(m)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Roles */}
        {roles.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{t("colRoles")}</label>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span key={r.id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-1 rounded-full">
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer — story link */}
      <div className="px-4 py-3 border-t border-slate-200 shrink-0">
        <Link
          href={`/projects/${projectId}/stories/${row.storyId}`}
          className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm0 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-8.5ZM6.5 6.75A.75.75 0 0 1 7.25 6h1.5a.75.75 0 0 1 0 1.5h-.75v3.25a.75.75 0 0 1-1.5 0v-3.25H6.5A.75.75 0 0 1 6.5 6.75ZM8 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
          </svg>
          Open in story view → {row.storyName}
        </Link>
      </div>
    </div>
  );
}

// ── Task table ────────────────────────────────────────────────────────────────

function TaskTable({
  rows,
  projectId,
  showAssignee,
  showRoles,
  teamRoles,
  emptyKey,
  selectedTaskId,
  onSelectTask,
}: {
  rows: TaskRow[];
  projectId: string;
  showAssignee: boolean;
  showRoles: boolean;
  teamRoles: TeamRole[];
  emptyKey: string;
  selectedTaskId: string | null;
  onSelectTask: (row: TaskRow) => void;
}) {
  const t = useTranslations("teamView");

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-slate-400 text-sm">
        {t(emptyKey as Parameters<typeof t>[0])}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{t("colTask")}</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{t("colStory")}</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{t("colSprint")}</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36 whitespace-nowrap">{t("colStatus")}</th>
            {showAssignee && <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{t("colAssignee")}</th>}
            {showRoles && <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{t("colRoles")}</th>}
            <th className="w-8 px-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const isSelected = row.task.id === selectedTaskId;
            const roles = row.roleIds
              .map((id) => teamRoles.find((r) => r.id === id))
              .filter(Boolean) as TeamRole[];
            return (
              <tr
                key={row.task.id}
                onClick={() => onSelectTask(row)}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-violet-50" : "hover:bg-slate-50"}`}
              >
                <td className="px-4 py-2.5">
                  <span className={`font-medium line-clamp-1 ${isSelected ? "text-violet-700" : "text-slate-800"}`}>
                    {row.task.name}
                  </span>
                  {row.task.description && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{row.task.description}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-600 max-w-[180px]">
                  <span className="truncate block text-sm">{row.storyName}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{row.sprintName}</td>
                <td className="px-4 py-2.5"><StatusPill status={row.task.status} /></td>
                {showAssignee && (
                  <td className="px-4 py-2.5">
                    {row.assignedMember ? (
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={row.assignedMember} size="xs" />
                        <span className="text-slate-700 text-xs">{memberDisplayName(row.assignedMember)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">{t("unassigned")}</span>
                    )}
                  </td>
                )}
                {showRoles && (
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {roles.length > 0 ? roles.map((r) => (
                        <span key={r.id} className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          {r.name}
                        </span>
                      )) : <span className="text-slate-400 text-xs">—</span>}
                    </div>
                  </td>
                )}
                {/* Open in story view */}
                <td className="px-2 py-2.5 text-right">
                  <Link
                    href={`/projects/${projectId}/stories/${row.storyId}`}
                    title={`Open ${row.storyName} in story view`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex text-slate-300 hover:text-violet-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.5 0h2a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0V4.56l-4.97 4.97a.75.75 0 0 1-1.06-1.06L10.44 3.5H9.25a.75.75 0 0 1 0-1.5Z"/>
                    </svg>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TeamView({ sprints, teamMembers, teamRoles, token, projectId }: Props) {
  const t = useTranslations("teamView");
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const rolesResize = useResize({ initial: 160, min: 60, max: 400, axis: "y" });

  useEffect(() => {
    if (!token || sprints.length === 0) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const sprintStories = await Promise.all(
        sprints.map(async (sprint) => ({
          sprint,
          stories: await listWorkflows(token, { job_id: sprint.id }).catch(() => []),
        }))
      );

      const rows: TaskRow[] = [];
      await Promise.all(
        sprintStories.flatMap(({ sprint, stories }) =>
          stories.map(async (story) => {
            const tasks = await listTasks(token, story.id).catch(() => []);
            await Promise.all(
              tasks.map(async (task: Task) => {
                const ttrs = await listTaskTeamRoles(token, task.id).catch(() => []);
                rows.push({
                  task,
                  storyId: story.id,
                  storyName: story.name,
                  sprintId: sprint.id,
                  sprintName: sprint.name,
                  roleIds: ttrs.map((r) => r.team_role_id),
                  assignedMember: task.assigned_to
                    ? (teamMembers.find((m) => m.user.id === task.assigned_to) ?? null)
                    : null,
                });
              })
            );
          })
        )
      );

      if (!cancelled) { setAllTasks(rows); setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [token, sprints, teamMembers]);

  // When a task is updated (status/assignee), patch it in allTasks and selectedTask
  function handleTaskUpdated(updated: Task) {
    setAllTasks((prev) => prev.map((r) => {
      if (r.task.id !== updated.id) return r;
      const assignedMember = updated.assigned_to
        ? (teamMembers.find((m) => m.user.id === updated.assigned_to) ?? null)
        : null;
      return { ...r, task: updated, assignedMember };
    }));
    setSelectedTask((prev) => {
      if (!prev || prev.task.id !== updated.id) return prev;
      const assignedMember = updated.assigned_to
        ? (teamMembers.find((m) => m.user.id === updated.assigned_to) ?? null)
        : null;
      return { ...prev, task: updated, assignedMember };
    });
  }

  const selectedRows = (() => {
    if (!selection) return [];
    if (selection.type === "role") return allTasks.filter((r) => r.roleIds.includes(selection.id));
    return allTasks.filter((r) => r.task.assigned_to === selection.id);
  })();

  const selectedRole = selection?.type === "role" ? teamRoles.find((r) => r.id === selection.id) ?? null : null;
  const selectedMember = selection?.type === "member" ? teamMembers.find((m) => m.user.id === selection.id) ?? null : null;

  const roleTaskCounts = new Map<string, number>();
  const memberTaskCounts = new Map<string, number>();
  allTasks.forEach((r) => {
    r.roleIds.forEach((id) => roleTaskCounts.set(id, (roleTaskCounts.get(id) ?? 0) + 1));
    if (r.task.assigned_to) memberTaskCounts.set(r.task.assigned_to, (memberTaskCounts.get(r.task.assigned_to) ?? 0) + 1);
  });

  if (teamMembers.length === 0 && teamRoles.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{t("noTeam")}</div>;
  }

  const sidebarItemCls = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
      active ? "bg-violet-50 text-violet-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
    }`;

  let panelHeader: string | null = null;
  if (selectedRole) panelHeader = t("tasksForRole", { name: selectedRole.name });
  if (selectedMember) panelHeader = t("tasksForMember", { name: memberDisplayName(selectedMember) });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 shrink-0 flex flex-col border-r border-slate-200 bg-white overflow-hidden">
        {/* Roles section — vertically resizable */}
        <div className="shrink-0 overflow-y-auto px-3 pt-4 pb-2" style={{ height: rolesResize.size }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">{t("rolesHeading")}</p>
          {teamRoles.length === 0 ? (
            <p className="text-xs text-slate-400 px-1 italic">{t("noRoles")}</p>
          ) : (
            <div className="space-y-0.5">
              {teamRoles.map((role) => {
                const count = roleTaskCounts.get(role.id) ?? 0;
                const active = selection?.type === "role" && selection.id === role.id;
                return (
                  <button key={role.id} type="button"
                    onClick={() => { setSelection(active ? null : { type: "role", id: role.id }); setSelectedTask(null); }}
                    className={sidebarItemCls(active)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-violet-500" : "bg-slate-300"}`} />
                      <span className="truncate">{role.name}</span>
                    </div>
                    {!loading && count > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resize handle between Roles and Members */}
        <div
          onMouseDown={rolesResize.onMouseDown}
          className="h-2 shrink-0 flex items-center justify-center cursor-row-resize bg-slate-100 hover:bg-violet-100 transition-colors group"
          title="Drag to resize"
        >
          <div className="w-8 h-0.5 rounded-full bg-slate-300 group-hover:bg-violet-400 transition-colors" />
        </div>

        {/* Members section — fills remaining sidebar space */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">{t("membersHeading")}</p>
          <div className="space-y-0.5">
            {teamMembers.map((member) => {
              const count = memberTaskCounts.get(member.user.id) ?? 0;
              const active = selection?.type === "member" && selection.id === member.user.id;
              return (
                <button key={member.user.id} type="button"
                  onClick={() => { setSelection(active ? null : { type: "member", id: member.user.id }); setSelectedTask(null); }}
                  className={sidebarItemCls(active)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MemberAvatar member={member} size="xs" />
                    <span className="truncate">{memberDisplayName(member)}</span>
                  </div>
                  {!loading && count > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${active ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Centre + right: table + optional task detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table column */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-5 py-3 border-b border-slate-200 shrink-0 flex items-center justify-between">
            {panelHeader ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{panelHeader}</h3>
                  {!loading && <p className="text-xs text-slate-400 mt-0.5">{t("taskCount", { count: selectedRows.length })}</p>}
                </div>
                {loading && <span className="text-xs text-slate-400">{t("loading")}</span>}
              </>
            ) : (
              <p className="text-sm text-slate-400">{t("selectPrompt")}</p>
            )}
          </div>

          {!selection ? (
            <div className="flex-1 flex items-center justify-center text-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-16 h-16">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{t("loading")}</div>
          ) : (
            <TaskTable
              rows={selectedRows}
              projectId={projectId}
              showAssignee={selection.type === "role"}
              showRoles={selection.type === "member"}
              teamRoles={teamRoles}
              emptyKey={selection.type === "role" ? "noTasksForRole" : "noTasksForMember"}
              selectedTaskId={selectedTask?.task.id ?? null}
              onSelectTask={(row) => setSelectedTask((prev) => prev?.task.id === row.task.id ? null : row)}
            />
          )}
        </div>

        {/* Task detail panel — slides in on the right */}
        {selectedTask && (
          <TaskDetailPanel
            row={selectedTask}
            teamMembers={teamMembers}
            teamRoles={teamRoles}
            token={token}
            projectId={projectId}
            onClose={() => setSelectedTask(null)}
            onTaskUpdated={handleTaskUpdated}
          />
        )}
      </div>
    </div>
  );
}
