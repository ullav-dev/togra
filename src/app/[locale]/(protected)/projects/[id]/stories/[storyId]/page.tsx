"use client";

import { useState, useEffect, use, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorkflow, updateWorkflow, updateTask,
  getTeam, listTeamRoles,
  listTaskTeamRoles, assignTaskTeamRole, removeTaskTeamRole,
} from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type {
  WorkflowWithTasks, Task, ProjectWithJobs, Status,
  TeamMember, TeamRole, TaskTeamRole,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NotesPanel from "@/components/notes/NotesPanel";
import VisibilityToggle from "@/components/VisibilityToggle";

export default function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; storyId: string }>;
}) {
  const { id: projectId, storyId } = use(params);
  const { token } = useAuth();
  const t = useTranslations("story");

  const [project, setProject] = useState<ProjectWithJobs | null>(null);
  const [story, setStory] = useState<WorkflowWithTasks | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsValue, setPointsValue] = useState("");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [taskTeamRoles, setTaskTeamRoles] = useState<Record<string, TaskTeamRole[]>>({});

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProject(token, projectId),
      getWorkflow(token, storyId),
    ]).then(async ([proj, wft]) => {
      setProject(proj);
      setStory(wft);
      setNameValue(wft.name);
      setPointsValue(wft.story_points?.toString() ?? "");

      const teamId = wft.team_id ?? proj.team_id ?? null;
      if (teamId) {
        const [team, roles] = await Promise.all([
          getTeam(token, teamId),
          listTeamRoles(token, teamId),
        ]).catch(() => [null, []] as [null, TeamRole[]]);

        if (team) setTeamMembers(team.members.filter((m) => m.status === "active"));
        setTeamRoles(roles);

        const ttrMap: Record<string, TaskTeamRole[]> = {};
        await Promise.all(
          wft.tasks.map(async (t) => {
            ttrMap[t.id] = await listTaskTeamRoles(token, t.id).catch(() => []);
          })
        );
        setTaskTeamRoles(ttrMap);
      }
    }).finally(() => setLoading(false));
  }, [token, projectId, storyId]);

  async function saveName() {
    if (!token || !story || !nameValue.trim()) return;
    setEditingName(false);
    if (nameValue.trim() === story.name) return;
    const updated = await updateWorkflow(token, storyId, { name: nameValue.trim() });
    setStory((prev) => prev ? { ...prev, ...updated } : prev);
  }

  async function savePoints() {
    if (!token || !story) return;
    setEditingPoints(false);
    const pts = pointsValue ? parseInt(pointsValue, 10) : undefined;
    if (pts === story.story_points) return;
    const updated = await updateWorkflow(token, storyId, { story_points: pts });
    setStory((prev) => prev ? { ...prev, ...updated } : prev);
  }

  async function onTaskStatusChange(task: Task, newStatus: Status) {
    if (!token || !story) return;
    const updated = await updateTask(token, task.id, { status: newStatus });
    setStory((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === updated.id ? updated : t) } : prev
    );
  }

  async function onAssigneeChange(task: Task, userId: string | null) {
    if (!token) return;
    const updated = await updateTask(token, task.id, { assigned_to: userId });
    setStory((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === updated.id ? updated : t) } : prev
    );
  }

  async function onRoleAdd(taskId: string, roleId: string) {
    if (!token) return;
    const ttr = await assignTaskTeamRole(token, taskId, roleId);
    setTaskTeamRoles((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), ttr] }));
  }

  async function onRoleRemove(taskId: string, roleId: string) {
    if (!token) return;
    await removeTaskTeamRole(token, taskId, roleId);
    setTaskTeamRoles((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((r) => r.team_role_id !== roleId),
    }));
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("loading")}</div>;
  if (!story) return <div className="p-8 text-slate-500 text-sm">{t("notFound")}</div>;

  const parentJobId = story.job_id;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap">
        <Link href="/projects" className="hover:text-violet-700 transition-colors">{t("breadcrumbProjects")}</Link>
        <span>/</span>
        <Link href={`/projects/${projectId}`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
        {parentJobId && (
          <>
            <span>/</span>
            <Link href={`/projects/${projectId}/jobs/${parentJobId}`} className="hover:text-violet-700 transition-colors">
              {project?.jobs?.find((j) => j.id === parentJobId)?.name ?? t("sprintFallback")}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-slate-700 font-medium truncate max-w-xs">{story.name}</span>
      </nav>

      {/* Story header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        {/* Name */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setNameValue(story.name); } }}
                className="text-xl font-bold text-slate-800 w-full border-b-2 border-violet-400 outline-none bg-transparent pb-0.5"
              />
            ) : (
              <h1
                className="text-xl font-bold text-slate-800 cursor-pointer hover:text-violet-700 transition-colors"
                onClick={() => setEditingName(true)}
                title="Click to edit"
              >
                {story.name}
              </h1>
            )}
          </div>
          <StatusPill status={story.status} />
        </div>

        {/* Story points + visibility */}
        <div className="flex items-center gap-6 text-sm text-slate-500 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-medium">{t("storyPoints")}</span>
            {editingPoints ? (
              <input
                autoFocus
                type="number"
                min="0"
                value={pointsValue}
                onChange={(e) => setPointsValue(e.target.value)}
                onBlur={savePoints}
                onKeyDown={(e) => { if (e.key === "Enter") savePoints(); if (e.key === "Escape") { setEditingPoints(false); setPointsValue(story.story_points?.toString() ?? ""); } }}
                className="w-16 border-b-2 border-violet-400 outline-none bg-transparent text-center text-sm font-semibold text-violet-700"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingPoints(true)}
                className="text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors"
                title="Click to edit"
              >
                {story.story_points != null ? story.story_points : "—"}
              </button>
            )}
          </div>

          <VisibilityToggle
            isShared={story.is_shared}
            onChange={async (val) => {
              if (!token) return;
              const updated = await updateWorkflow(token, storyId, { is_shared: val });
              setStory((prev) => prev ? { ...prev, is_shared: updated.is_shared } : prev);
            }}
          />
        </div>
      </div>

      {/* Tasks (workflow steps) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">{t("workflowSteps")}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t("taskCount", { count: story.tasks.length })}</p>
        </div>
        {story.tasks.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-400">{t("noSteps")}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {story.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                taskRoles={taskTeamRoles[task.id] ?? []}
                teamMembers={teamMembers}
                teamRoles={teamRoles}
                onStatusChange={(s) => onTaskStatusChange(task, s)}
                onAssigneeChange={(userId) => onAssigneeChange(task, userId)}
                onRoleAdd={(roleId) => onRoleAdd(task.id, roleId)}
                onRoleRemove={(roleId) => onRoleRemove(task.id, roleId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <NotesPanel entityType="workflow" entityId={storyId} isTeam={true} />
      </div>
    </div>
  );
}

// ── MemberAvatar ──────────────────────────────────────────────────────────────

function MemberAvatar({ member, size = "sm" }: { member: TeamMember; size?: "sm" | "xs" }) {
  const [broken, setBroken] = useState(false);
  const prevUrl = useRef(member.user.avatar_url);
  useEffect(() => {
    if (member.user.avatar_url !== prevUrl.current) {
      setBroken(false);
      prevUrl.current = member.user.avatar_url;
    }
  }, [member.user.avatar_url]);

  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();

  const dim = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";

  if (member.user.avatar_url && !broken) {
    return (
      <img
        src={member.user.avatar_url}
        alt={initials}
        title={`${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username}
        className={`${dim} rounded-full object-cover shrink-0`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      title={`${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username}
      className={`${dim} rounded-full bg-violet-100 text-violet-700 font-semibold flex items-center justify-center select-none shrink-0`}
    >
      {initials}
    </span>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  taskRoles,
  teamMembers,
  teamRoles,
  onStatusChange,
  onAssigneeChange,
  onRoleAdd,
  onRoleRemove,
}: {
  task: Task;
  taskRoles: TaskTeamRole[];
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  onStatusChange: (status: Status) => void;
  onAssigneeChange: (userId: string | null) => void;
  onRoleAdd: (roleId: string) => void;
  onRoleRemove: (roleId: string) => void;
}) {
  const t = useTranslations("story");
  const statuses: Status[] = ["Not Started", "Ready", "In Progress", "On Hold", "Complete"];

  const assignedRoleIds = new Set(taskRoles.map((r) => r.team_role_id));
  const unassignedRoles = teamRoles.filter((r) => !assignedRoleIds.has(r.id));

  // When the task has roles, restrict the assignee list to members who hold any of those roles.
  const eligibleMembers = assignedRoleIds.size > 0
    ? teamMembers.filter((m) => m.team_roles.some((mr) => assignedRoleIds.has(mr.id)))
    : teamMembers;

  function displayName(m: TeamMember): string {
    return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
  }

  const assignedMember = task.assigned_to
    ? teamMembers.find((m) => m.user.id === task.assigned_to)
    : null;

  return (
    <div className="px-6 py-3 hover:bg-slate-50 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{task.name}</p>
          {task.description && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{task.description}</p>
          )}
        </div>

        {/* Assignee — filtered to role-eligible members when roles are set */}
        {teamMembers.length > 0 && (
          <div className="flex items-center gap-1.5">
            {assignedMember && <MemberAvatar member={assignedMember} size="xs" />}
            <select
              value={task.assigned_to ?? ""}
              onChange={(e) => onAssigneeChange(e.target.value || null)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white text-slate-600 max-w-[120px] truncate"
              title={assignedMember ? displayName(assignedMember) : t("unassigned")}
            >
              <option value="">{t("unassigned")}</option>
              {eligibleMembers.map((m) => (
                <option key={m.user.id} value={m.user.id}>{displayName(m)}</option>
              ))}
            </select>
          </div>
        )}
        {teamMembers.length === 0 && task.assigned_to && (
          <span className="text-xs text-slate-400 italic">@{task.assigned_to.slice(0, 8)}</span>
        )}

        {/* Status */}
        <select
          value={task.status}
          onChange={(e) => onStatusChange(e.target.value as Status)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{t(`statuses.${s}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>

      {/* Team roles row */}
      {(taskRoles.length > 0 || unassignedRoles.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap pl-0">
          {taskRoles.map((ttr) => {
            const role = teamRoles.find((r) => r.id === ttr.team_role_id);
            if (!role) return null;
            return (
              <span
                key={ttr.team_role_id}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full"
              >
                {role.name}
                <button
                  type="button"
                  onClick={() => onRoleRemove(ttr.team_role_id)}
                  className="text-violet-400 hover:text-violet-700 transition-colors leading-none"
                  title={`Remove ${role.name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
          {unassignedRoles.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onRoleAdd(e.target.value); }}
              className="text-[10px] border border-dashed border-slate-300 rounded-full px-2 py-0.5 focus:border-violet-400 focus:outline-none bg-white text-slate-400 cursor-pointer"
            >
              <option value="">+ role</option>
              {unassignedRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
