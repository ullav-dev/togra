"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserTeamRoleNames } from "@/lib/auth-api";
import {
  listWorkflows,
  getJobWorkflowAllocations,
  updateTask,
  assignTaskTeamRole,
  removeTaskTeamRole,
  listTaskTeamRoles,
  getTeam,
  listTeamRoles,
} from "@/lib/awe-api";
import type { Job, Workflow, WorkflowAllocation, TeamMember, TeamRole } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import RefreshControl from "@/components/RefreshControl";

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type SortKey = "priority" | "created" | "updated";
type FilterMode = "all" | "mine";

interface Props {
  job: Job;
  projectId: string;
}

export default function KanbanBoard({ job, projectId }: Props) {
  const t = useTranslations("board");
  const { token, user } = useAuth();

  const [stories, setStories] = useState<Workflow[]>([]);
  const [allocations, setAllocations] = useState<WorkflowAllocation[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [filterMode, setFilterMode] = useState<FilterMode>("mine");

  // JWT team_roles holds role names (not UUIDs); used for "mine" filter
  const userRoleNames = getUserTeamRoleNames(token, job.team_id ?? null);

  const allocationMap = allocations.reduce<Record<string, WorkflowAllocation>>(
    (acc, a) => { acc[a.workflow_id] = a; return acc; },
    {}
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    const [wfs, allocs] = await Promise.all([
      listWorkflows(token, { job_id: job.id }),
      getJobWorkflowAllocations(token, job.id),
    ]);
    setStories(wfs);
    setAllocations(allocs);
  }, [token, job.id]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const teamId = job.team_id ?? null;
    Promise.all([
      loadData(),
      teamId ? getTeam(token, teamId).then((team) => setTeamMembers(team.members.filter((m) => m.status === "active"))).catch(() => {}) : Promise.resolve(),
      teamId ? listTeamRoles(token, teamId).then(setTeamRoles).catch(() => {}) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [token, job.id, job.team_id, loadData]);

  function matchesFilter(story: Workflow): boolean {
    if (filterMode === "all") return true;
    const alloc = allocationMap[story.id];
    if (!alloc) return false;
    if (alloc.assigned_to === user?.id) return true;
    // Map role UUIDs from the allocation to names, then compare against
    // the role names in the JWT (which stores names, not IDs)
    const allocRoleNames = alloc.team_role_ids
      .map((rid) => teamRoles.find((r) => r.id === rid)?.name)
      .filter(Boolean) as string[];
    return allocRoleNames.some((name) => userRoleNames.includes(name));
  }

  function sortStories(list: Workflow[]): Workflow[] {
    return [...list].sort((a, b) => {
      if (sortBy === "priority") {
        const ra = PRIORITY_RANK[a.priority ?? ""] ?? 99;
        const rb = PRIORITY_RANK[b.priority ?? ""] ?? 99;
        if (ra !== rb) return ra - rb;
      }
      if (sortBy === "created") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  const filtered = sortStories(stories.filter(matchesFilter));

  async function handleTake(story: Workflow) {
    if (!token || !user) return;
    const alloc = allocationMap[story.id];
    if (!alloc?.start_task_id) return;
    await updateTask(token, alloc.start_task_id, { assigned_to: user.id });
    setAllocations((prev) =>
      prev.map((a) => a.workflow_id === story.id ? { ...a, assigned_to: user.id } : a)
    );
  }

  async function handleAssignToUser(story: Workflow, userId: string) {
    if (!token) return;
    const alloc = allocationMap[story.id];
    if (!alloc?.start_task_id) return;
    await updateTask(token, alloc.start_task_id, { assigned_to: userId });
    setAllocations((prev) =>
      prev.map((a) => a.workflow_id === story.id ? { ...a, assigned_to: userId } : a)
    );
  }

  async function handleAssignToRole(story: Workflow, roleId: string) {
    if (!token) return;
    const alloc = allocationMap[story.id];
    if (!alloc?.start_task_id) return;
    // Clear user assignee and existing roles, then add new role
    await updateTask(token, alloc.start_task_id, { assigned_to: null });
    const existing = await listTaskTeamRoles(token, alloc.start_task_id);
    await Promise.all(existing.map((r) => removeTaskTeamRole(token, alloc.start_task_id!, r.team_role_id)));
    await assignTaskTeamRole(token, alloc.start_task_id, roleId);
    setAllocations((prev) =>
      prev.map((a) =>
        a.workflow_id === story.id
          ? { ...a, assigned_to: null, team_role_ids: [roleId] }
          : a
      )
    );
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("kanbanBoard.sortLabel")}</div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Controls bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">{t("kanbanBoard.sortLabel")}</span>
          <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs font-medium">
            {(["priority", "created", "updated"] as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                className={`px-3 py-1 transition-colors border-l first:border-l-0 border-slate-200 ${
                  sortBy === key
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-slate-500 hover:text-teal-700"
                }`}
              >
                {key === "priority" ? t("kanbanBoard.sortPriority") :
                 key === "created"  ? t("kanbanBoard.sortCreated") :
                                      t("kanbanBoard.sortUpdated")}
              </button>
            ))}
          </div>
        </div>

        {/* Filter */}
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

      {/* Story cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">{filterMode === "mine" ? t("kanbanBoard.noStoriesMine") : t("kanbanBoard.noStoriesAll")}</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {filtered.map((story) => (
            <KanbanStoryCard
              key={story.id}
              story={story}
              alloc={allocationMap[story.id]}
              projectId={projectId}
              teamMembers={teamMembers}
              teamRoles={teamRoles}
              currentUserId={user?.id ?? null}
              onTake={() => handleTake(story)}
              onAssignToUser={(uid) => handleAssignToUser(story, uid)}
              onAssignToRole={(rid) => handleAssignToRole(story, rid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Story card ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-yellow-100 text-yellow-700",
  low:      "bg-slate-100 text-slate-500",
};

function formatAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" }) {
  const { first_name, last_name, username, avatar_url } = member.user;
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

function KanbanStoryCard({
  story,
  alloc,
  projectId,
  teamMembers,
  teamRoles,
  currentUserId,
  onTake,
  onAssignToUser,
  onAssignToRole,
}: {
  story: Workflow;
  alloc: WorkflowAllocation | undefined;
  projectId: string;
  teamMembers: TeamMember[];
  teamRoles: TeamRole[];
  currentUserId: string | null;
  onTake: () => Promise<void>;
  onAssignToUser: (uid: string) => Promise<void>;
  onAssignToRole: (rid: string) => Promise<void>;
}) {
  const t = useTranslations("board");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [taking, setTaking] = useState(false);
  const reassignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reassignOpen) return;
    const handler = (e: MouseEvent) => {
      if (reassignRef.current && !reassignRef.current.contains(e.target as Node)) setReassignOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reassignOpen]);

  const assignedMember = alloc?.assigned_to
    ? teamMembers.find((m) => m.user.id === alloc.assigned_to)
    : null;

  const assignedRoles = alloc?.team_role_ids
    .map((rid) => teamRoles.find((r) => r.id === rid))
    .filter(Boolean) as TeamRole[];

  const isAllocated = !!(alloc?.assigned_to || (alloc?.team_role_ids ?? []).length > 0);

  async function handleTake() {
    setTaking(true);
    try { await onTake(); } finally { setTaking(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-teal-200 hover:shadow-sm transition-all group">
      {/* Top row: name + badges */}
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/projects/${projectId}/stories/${story.id}`}
            className="text-sm font-medium text-slate-800 hover:text-teal-700 transition-colors leading-snug"
          >
            {story.name}
          </Link>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {story.priority && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[story.priority] ?? "bg-slate-100 text-slate-500"}`}>
              {story.priority}
            </span>
          )}
          {story.story_points != null && (
            <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-1.5 py-0.5 rounded-full">
              {story.story_points}{t("kanbanBoard.pts") !== "pts" ? ` ${t("kanbanBoard.pts")}` : "p"}
            </span>
          )}
        </div>
      </div>

      {/* Middle row: status + allocation */}
      <div className="flex items-center gap-2 mb-3">
        <StatusPill status={story.status} />
        {isAllocated ? (
          <div className="flex items-center gap-1.5">
            {assignedMember && <MemberAvatar member={assignedMember} size="sm" />}
            {assignedRoles.map((role) => (
              <span key={role.id} className="text-[11px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                {role.name}
              </span>
            ))}
            {!assignedMember && assignedRoles.length === 0 && (
              <span className="text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">{t("kanbanBoard.unallocated")}</span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 italic">{t("kanbanBoard.unallocated")}</span>
        )}
        <span className="ml-auto text-[11px] text-slate-400">{t("kanbanBoard.updatedAgo").replace("{ago}", formatAgo(story.updated_at))}</span>
      </div>

      {/* Actions row */}
      {alloc?.start_task_id && (
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {alloc.assigned_to !== currentUserId && (
            <button
              type="button"
              disabled={taking}
              onClick={handleTake}
              className="text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
            >
              {t("kanbanBoard.take")}
            </button>
          )}
          <div className="relative" ref={reassignRef}>
            <button
              type="button"
              onClick={() => setReassignOpen((v) => !v)}
              className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
            >
              {t("kanbanBoard.reassign")}
            </button>
            {reassignOpen && (
              <ReassignPopover
                teamMembers={teamMembers}
                teamRoles={teamRoles}
                onAssignUser={(uid) => { onAssignToUser(uid); setReassignOpen(false); }}
                onAssignRole={(rid) => { onAssignToRole(rid); setReassignOpen(false); }}
              />
            )}
          </div>
        </div>
      )}
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
    <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-30">
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
