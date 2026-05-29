"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Task, TeamMember, TeamRole } from "@/lib/types";

const STATUS_COLORS: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  "Not Started": { border: "border-slate-300",   bg: "bg-white",        text: "text-slate-700",   dot: "bg-slate-300"   },
  "Ready":       { border: "border-cyan-400",    bg: "bg-cyan-50",      text: "text-cyan-800",    dot: "bg-cyan-500"    },
  "In Progress": { border: "border-blue-400",    bg: "bg-blue-50",      text: "text-blue-800",    dot: "bg-blue-500"    },
  "On Hold":     { border: "border-amber-400",   bg: "bg-amber-50",     text: "text-amber-800",   dot: "bg-amber-500"   },
  "Complete":    { border: "border-emerald-400", bg: "bg-emerald-50",   text: "text-emerald-800", dot: "bg-emerald-500" },
  "Cancelled":   { border: "border-slate-200",   bg: "bg-slate-100",   text: "text-slate-400",   dot: "bg-slate-300"   },
};

const DECISION_COLORS = { border: "border-indigo-400", bg: "bg-indigo-50", text: "text-indigo-800", dot: "bg-indigo-500" };

export type StoryTaskNodeData = {
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
  roles: TeamRole[];
  assignedMember: TeamMember | null;
};

function MemberAvatar({ member }: { member: TeamMember }) {
  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();
  const label = `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username;

  if (member.user.avatar_url) {
    return (
      <img
        src={member.user.avatar_url}
        alt={label}
        title={label}
        className="w-5 h-5 rounded-full object-cover shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <span title={label} className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold flex items-center justify-center shrink-0 select-none">
      {initials}
    </span>
  );
}

export default function StoryTaskNode({ data }: NodeProps) {
  const d = data as unknown as StoryTaskNodeData;
  const { task, selected, onSelect, roles = [], assignedMember } = d;

  const isDecision = task.task_type === "decision";
  const colors = isDecision
    ? DECISION_COLORS
    : (STATUS_COLORS[task.status] ?? STATUS_COLORS["Not Started"]);

  const displayName = assignedMember
    ? (`${assignedMember.user.first_name ?? ""} ${assignedMember.user.last_name ?? ""}`.trim() || assignedMember.user.username)
    : null;

  return (
    <div
      onClick={() => onSelect(task.id)}
      className={`
        relative cursor-pointer select-none rounded-xl border-2 px-3 py-2.5 w-48 shadow-sm
        transition-all hover:shadow-md
        ${colors.border} ${colors.bg}
        ${selected ? "ring-2 ring-violet-500 ring-offset-2 shadow-lg" : ""}
      `}
    >
      {/* Start badge */}
      {task.is_start && (
        <div className="absolute -top-2.5 -left-2.5 z-10 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center" title="Start">
          <svg viewBox="0 0 8 8" className="w-2.5 h-2.5 fill-white"><path d="M2 1 L7 4 L2 7 Z"/></svg>
        </div>
      )}
      {/* End badge */}
      {task.is_end && (
        <div className="absolute -top-2.5 -right-2.5 z-10 w-5 h-5 rounded-full bg-slate-600 border-2 border-white flex items-center justify-center" title="End">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      )}
      {/* Decision diamond */}
      {isDecision && (
        <div
          className="absolute z-10 w-4 h-4 bg-indigo-600 border-2 border-white"
          style={{ top: "-10px", left: "50%", transform: "translateX(-50%) rotate(45deg)" }}
          title="Decision"
        />
      )}

      {/* Forward handles */}
      <Handle id="forward-target" type="target" position={Position.Left}  className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle id="forward-source" type="source" position={Position.Right} className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white" />
      {/* Loop-back handles (invisible, for curved back-edges) */}
      <Handle id="loop-source" type="source" position={Position.Bottom} style={{ left: "62%", opacity: 0, pointerEvents: "none" }} isConnectable={false} />
      <Handle id="loop-target" type="target" position={Position.Bottom} style={{ left: "38%", opacity: 0, pointerEvents: "none" }} isConnectable={false} />

      {/* Task name + status dot */}
      <div className="flex items-start gap-2">
        <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${colors.dot}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium leading-tight ${colors.text}`}>{task.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{task.status}</p>
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-slate-400 mt-1.5 leading-snug line-clamp-2">{task.description}</p>
      )}

      {/* Role badges */}
      {roles.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {roles.slice(0, 2).map((r) => (
            <span key={r.id} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full leading-none truncate max-w-full">
              {r.name}
            </span>
          ))}
          {roles.length > 2 && (
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full leading-none">
              +{roles.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Assignee */}
      {assignedMember && (
        <div className="flex items-center gap-1.5 mt-2">
          <MemberAvatar member={assignedMember} />
          <span className="text-xs text-slate-500 truncate">{displayName}</span>
        </div>
      )}
    </div>
  );
}
