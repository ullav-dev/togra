"use client";

import { useState, useEffect } from "react";
import { updateTask, assignTaskTeamRole, removeTaskTeamRole } from "@/lib/awe-api";
import { useResize } from "@/hooks/useResize";
import ConfirmDialog from "@/components/ConfirmDialog";
import AutomatedStepConfig from "@/components/workflow/AutomatedStepConfig";
import type { Task, TaskLink, TeamMember, TeamRole, TaskTeamRole } from "@/lib/types";

interface Props {
  task: Task;
  allTasks: Task[];
  outgoingLinks: TaskLink[];
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  taskTeamRoles: TaskTeamRole[];
  token: string;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
  onLinkRemoved: (fromId: string, toId: string) => void;
  onBranchLabelChanged: (fromId: string, toId: string, label: string | null) => void;
  onClose: () => void;
  onRolesUpdated: (taskId: string, roles: TaskTeamRole[]) => void;
}

function memberDisplayName(m: TeamMember) {
  return `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim() || m.user.username;
}

function MemberAvatar({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const initials = (`${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`).toUpperCase()
    || member.user.username.charAt(0).toUpperCase();
  if (member.user.avatar_url && !broken) {
    return <img src={member.user.avatar_url} alt={initials} className="w-5 h-5 rounded-full object-cover shrink-0" onError={() => setBroken(true)} />;
  }
  return <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold flex items-center justify-center shrink-0 select-none">{initials}</span>;
}

export default function StepEditDrawer({
  task, allTasks, outgoingLinks,
  teamMembers, teamRoles, taskTeamRoles,
  token, onTaskUpdated, onTaskDeleted, onLinkRemoved, onBranchLabelChanged, onClose, onRolesUpdated,
}: Props) {
  const [draftName, setDraftName] = useState(task.name);
  const [draftDesc, setDraftDesc] = useState(task.description ?? "");
  const [draftType, setDraftType] = useState<"standard" | "decision" | "automated">(
    task.task_type === "decision" ? "decision" : task.task_type === "automated" ? "automated" : "standard"
  );
  const [draftIsStart, setDraftIsStart] = useState(task.is_start);
  const [draftIsEnd, setDraftIsEnd] = useState(task.is_end);
  const [draftAssignee, setDraftAssignee] = useState<string | null>(task.assigned_to ?? null);

  const resize = useResize({ initial: 288, min: 220, max: 560, axis: "x", reverse: true });

  const [saving, setSaving] = useState(false);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingLabelFor, setEditingLabelFor] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  // Reset draft when a different task is selected
  useEffect(() => {
    setDraftName(task.name);
    setDraftDesc(task.description ?? "");
    setDraftType(task.task_type === "decision" ? "decision" : "standard");
    setDraftIsStart(task.is_start);
    setDraftIsEnd(task.is_end);
    setDraftAssignee(task.assigned_to ?? null);
  }, [task.id]);

  const savedType = task.task_type === "decision" ? "decision" : task.task_type === "automated" ? "automated" : "standard";
  const isDirty =
    draftName.trim() !== task.name ||
    draftDesc.trim() !== (task.description ?? "") ||
    draftType !== savedType ||
    draftIsStart !== task.is_start ||
    draftIsEnd !== task.is_end ||
    draftAssignee !== (task.assigned_to ?? null);

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Parameters<typeof updateTask>[2] = {};
      if (draftName.trim() !== task.name) patch.name = draftName.trim();
      if (draftDesc.trim() !== (task.description ?? "")) patch.description = draftDesc.trim() || undefined;
      if (draftType !== savedType) patch.task_type = draftType;
      if (draftIsStart !== task.is_start) patch.is_start = draftIsStart;
      if (draftIsEnd !== task.is_end) patch.is_end = draftIsEnd;
      if (draftAssignee !== (task.assigned_to ?? null)) patch.assigned_to = draftAssignee;
      const updated = await updateTask(token, task.id, patch);
      onTaskUpdated(updated);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    setConfirmDelete(false);
    try {
      const { deleteTask } = await import("@/lib/awe-api");
      await deleteTask(token, task.id);
      onTaskDeleted(task.id);
    } finally { setDeleting(false); }
  }

  async function handleAddRole(teamRoleId: string) {
    setRolesBusy(true);
    try {
      await assignTaskTeamRole(token, task.id, teamRoleId);
      const newTTR = { task_id: task.id, team_role_id: teamRoleId, assigned_at: new Date().toISOString() };
      onRolesUpdated(task.id, [...taskTeamRoles, newTTR]);
    } finally { setRolesBusy(false); }
  }

  async function handleRemoveRole(teamRoleId: string) {
    setRolesBusy(true);
    try {
      await removeTaskTeamRole(token, task.id, teamRoleId);
      onRolesUpdated(task.id, taskTeamRoles.filter((r) => r.team_role_id !== teamRoleId));
    } finally { setRolesBusy(false); }
  }

  async function handleSaveBranchLabel(toId: string) {
    const trimmed = labelDraft.trim() || null;
    onBranchLabelChanged(task.id, toId, trimmed);
    setEditingLabelFor(null);
  }

  const assignedMember = draftAssignee ? teamMembers.find((m) => m.user.id === draftAssignee) ?? null : null;
  const activeMembers = teamMembers.filter((m) => m.status === "active");
  const currentRoles = taskTeamRoles.filter((ttr) => ttr.task_id === task.id);
  const unassignedRoles = teamRoles.filter((r) => !currentRoles.some((ttr) => ttr.team_role_id === r.id));

  const labelCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5";
  const sectionCls = "space-y-1.5";

  return (
    <>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete step?"
          message={`"${task.name}" and all its connections will be permanently removed.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div
        onMouseDown={resize.onMouseDown}
        className="w-1.5 shrink-0 bg-slate-100 hover:bg-violet-200 cursor-col-resize transition-colors"
        title="Drag to resize"
      />

      <div className="shrink-0 border-l border-slate-200 flex flex-col bg-white overflow-hidden" style={{ width: resize.size }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
          <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Edit step</span>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Name */}
          <div className={sectionCls}>
            <label className={labelCls}>Name</label>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              disabled={saving}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div className={sectionCls}>
            <label className={labelCls}>Description</label>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              disabled={saving}
              rows={2}
              placeholder="Optional…"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white resize-none disabled:opacity-50 placeholder:text-slate-400"
            />
          </div>

          {/* Type */}
          <div className={sectionCls}>
            <label className={labelCls}>Type</label>
            <div className="flex gap-2">
              {([
                ["standard", "Standard"],
                ["decision", "Decision ◇"],
                ["automated", "Automated ⚡"],
              ] as const).map(([t, label]) => (
                <button key={t} type="button" onClick={() => setDraftType(t)} disabled={saving}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    draftType === t ? "bg-violet-50 border-violet-400 text-violet-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Start / End flags */}
          <div className={sectionCls}>
            <label className={labelCls}>Flags</label>
            <div className="space-y-1.5">
              {([["is_start", "Start step", draftIsStart, setDraftIsStart], ["is_end", "End step", draftIsEnd, setDraftIsEnd]] as const).map(
                ([key, label, val, setter]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} disabled={saving}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Assignee */}
          <div className={sectionCls}>
            <label className={labelCls}>Assignee</label>
            <div className="flex items-center gap-2">
              {assignedMember && <MemberAvatar member={assignedMember} />}
              <select value={draftAssignee ?? ""} onChange={(e) => setDraftAssignee(e.target.value || null)} disabled={saving}
                className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50">
                <option value="">Unassigned</option>
                {activeMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>{memberDisplayName(m)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Roles */}
          <div className={sectionCls}>
            <label className={labelCls}>Roles</label>
            {currentRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {currentRoles.map((ttr) => {
                  const role = teamRoles.find((r) => r.id === ttr.team_role_id);
                  if (!role) return null;
                  return (
                    <span key={ttr.team_role_id} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 pl-2 pr-1 py-0.5 rounded-full">
                      {role.name}
                      <button type="button" onClick={() => void handleRemoveRole(ttr.team_role_id)} disabled={rolesBusy}
                        className="text-violet-400 hover:text-violet-700 disabled:opacity-40 transition-colors">
                        <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                          <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L6 4.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 6l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 0 1-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 0 1 0-1.06z" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {unassignedRoles.length > 0 && (
              <select value="" onChange={(e) => { if (e.target.value) void handleAddRole(e.target.value); }}
                disabled={rolesBusy}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50 text-slate-400">
                <option value="">Add a role…</option>
                {unassignedRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </div>

          {/* Automated step — script configuration */}
          {draftType === "automated" && (
            <div className={sectionCls}>
              <div className="border-t border-slate-200 pt-4">
                <label className={labelCls + " mb-3"}>Script configuration</label>
                <AutomatedStepConfig taskId={task.id} token={token} />
              </div>
            </div>
          )}

          {/* Outgoing connections */}
          {outgoingLinks.length > 0 && (
            <div className={sectionCls}>
              <label className={labelCls}>Outgoing connections</label>
              <div className="space-y-1.5">
                {outgoingLinks.map((link) => {
                  const target = allTasks.find((t) => t.id === link.to_task_id);
                  const isEditingLabel = editingLabelFor === link.to_task_id;
                  return (
                    <div key={link.to_task_id} className="rounded-lg border border-slate-200 px-3 py-2 bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-700 font-medium truncate">→ {target?.name ?? link.to_task_id}</span>
                        <button type="button" onClick={() => onLinkRemoved(link.from_task_id, link.to_task_id)}
                          className="text-slate-300 hover:text-red-500 transition-colors shrink-0" title="Remove connection">
                          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L6 4.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 6l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 0 1-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 0 1 0-1.06z" />
                          </svg>
                        </button>
                      </div>
                      {/* Branch label */}
                      {isEditingLabel ? (
                        <div className="flex gap-1.5 mt-1.5">
                          <input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
                            placeholder="Branch label…"
                            className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:border-violet-500 focus:outline-none" />
                          <button type="button" onClick={() => void handleSaveBranchLabel(link.to_task_id)}
                            className="text-xs font-medium text-violet-700 hover:text-violet-900 px-2">Save</button>
                          <button type="button" onClick={() => setEditingLabelFor(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => { setEditingLabelFor(link.to_task_id); setLabelDraft(link.branch_label ?? ""); }}
                          className="mt-1 text-xs text-slate-400 hover:text-violet-600 transition-colors">
                          {link.branch_label ? `Label: "${link.branch_label}"` : "Add branch label…"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 shrink-0 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={deleting || saving}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40 transition-colors">
            {deleting ? "Deleting…" : "Delete step"}
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!isDirty || saving}
            className="px-4 py-1.5 text-sm font-medium rounded-lg transition-colors bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
