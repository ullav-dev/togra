"use client";

import { useState, useEffect, useRef, use } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getJob, listWorkflows, updateWorkflow, listTasks, getTeam } from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type { Job, Workflow, Task, Project, Status, TeamMember } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

const STORY_COLUMNS: { status: Status; labelKey: string; bg: string; border: string; header: string; overBorder: string }[] = [
  { status: "Not Started", labelKey: "todo",       bg: "bg-slate-50",   border: "border-slate-200",   header: "text-slate-500",   overBorder: "border-violet-400 bg-violet-50" },
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
  const { token } = useAuth();
  const router = useRouter();
  const t = useTranslations("board");

  const columns = STORY_COLUMNS.map((col) => ({ ...col, label: t(`columns.${col.labelKey}` as Parameters<typeof t>[0]) }));

  const [project, setProject] = useState<Project | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [stories, setStories] = useState<Workflow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
      const teamId = j.team_id ?? proj.team_id ?? null;
      if (teamId) {
        const team = await getTeam(token, teamId).catch(() => null);
        if (team) setTeamMembers(team.members.filter((m) => m.status === "active"));
      }
    }).finally(() => setLoading(false));
  }, [token, projectId, jobId]);

  useEffect(() => {
    if (job && job.job_type === "backlog") {
      router.replace(`/projects/${projectId}`);
    }
  }, [job, projectId, router]);

  async function onStatusChange(storyId: string, newStatus: Status) {
    if (!token) return;
    const story = stories.find((s) => s.id === storyId);
    if (!story || story.status === newStatus) return;
    setStories((prev) => prev.map((s) => s.id === storyId ? { ...s, status: newStatus } : s));
    try {
      const updated = await updateWorkflow(token, storyId, { status: newStatus });
      setStories((prev) => prev.map((s) => s.id === updated.id ? updated : s));
    } catch {
      setStories((prev) => prev.map((s) => s.id === storyId ? story : s));
    }
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("loading")}</div>;
  if (!job) return <div className="p-8 text-slate-500 text-sm">{t("notFound")}</div>;

  const typeLabel = job.job_type === "sprint" ? t("sprint") : job.job_type === "kanban" ? t("kanban") : "Board";
  const dateRange = job.start_date && job.end_date
    ? ` · ${fmtDate(job.start_date)} – ${fmtDate(job.end_date)}`
    : "";

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-violet-700 transition-colors">{t("breadcrumbProjects")}</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{job.name}</span>
        </nav>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{job.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            job.job_type === "sprint" ? "bg-indigo-50 text-indigo-700" :
            job.job_type === "kanban" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
          }`}>{typeLabel}</span>
          {dateRange && <span className="text-xs text-slate-400">{dateRange}</span>}
          <span className="text-xs text-slate-400">{t("stories", { count: stories.length })}</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((col) => {
            const colStories = stories.filter((s) => s.status === col.status);
            return (
              <StoryColumn
                key={col.status}
                column={col}
                stories={colStories}
                projectId={projectId}
                teamMembers={teamMembers}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onDrop={(storyId) => onStatusChange(storyId, col.status)}
                onStatusChange={(storyId, status) => onStatusChange(storyId, status)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Story Column ──────────────────────────────────────────────────────────────

function StoryColumn({
  column,
  stories,
  projectId,
  teamMembers,
  draggingId,
  onDragStart,
  onDragEnd,
  onDrop,
  onStatusChange,
}: {
  column: (typeof STORY_COLUMNS)[number] & { label: string };
  stories: Workflow[];
  projectId: string;
  teamMembers: TeamMember[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (storyId: string) => void;
  onStatusChange: (storyId: string, status: Status) => void;
}) {
  const t = useTranslations("board");
  const [isOver, setIsOver] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); dragCounter.current++; setIsOver(true); }
  function handleDragLeave() { dragCounter.current--; if (dragCounter.current === 0) setIsOver(false); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); dragCounter.current = 0; setIsOver(false);
    const id = e.dataTransfer.getData("storyId");
    if (id) onDrop(id);
  }

  const colClass = isOver
    ? `border-2 ${column.overBorder}`
    : `border ${column.bg} ${column.border}`;

  return (
    <div
      className={`flex flex-col rounded-xl w-72 shrink-0 transition-colors ${colClass}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="px-4 py-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${column.header}`}>{column.label}</span>
          <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 font-medium">
            {stories.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-24">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            projectId={projectId}
            teamMembers={teamMembers}
            isDragging={draggingId === story.id}
            isDraggingActive={draggingId !== null}
            allStatuses={STORY_COLUMNS.map((c) => c.status)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onStatusChange={onStatusChange}
          />
        ))}
        {stories.length === 0 && (
          <p className={`text-xs text-center py-4 transition-colors ${isOver ? "text-violet-400" : "text-slate-400"}`}>
            {isOver ? t("dropHere") : t("noStories")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Story Card ────────────────────────────────────────────────────────────────

function StoryCard({
  story,
  projectId,
  teamMembers,
  isDragging,
  isDraggingActive,
  allStatuses,
  onDragStart,
  onDragEnd,
  onStatusChange,
}: {
  story: Workflow;
  projectId: string;
  teamMembers: TeamMember[];
  isDragging: boolean;
  isDraggingActive: boolean;
  allStatuses: Status[];
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onStatusChange: (id: string, status: Status) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskProgress, setTaskProgress] = useState<{ done: number; total: number } | null>(null);
  const [assignees, setAssignees] = useState<TeamMember[]>([]);
  const { token } = useAuth();

  // Load task progress and derive unique assignees once on first render
  useEffect(() => {
    if (!token) return;
    listTasks(token, story.id).then((tasks) => {
      const done = tasks.filter((t: Task) => t.status === "Complete").length;
      setTaskProgress({ done, total: tasks.length });
      const assignedIds = [...new Set(tasks.map((t: Task) => t.assigned_to).filter(Boolean))];
      setAssignees(
        assignedIds
          .map((id) => teamMembers.find((m) => m.user.id === id))
          .filter((m): m is TeamMember => m !== undefined)
      );
    }).catch(() => {});
  }, [story.id, token, teamMembers]);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("storyId", story.id);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => onDragStart(story.id));
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border p-3 shadow-sm select-none transition-all
        ${isDragging ? "opacity-40 border-violet-300 shadow-none cursor-grabbing"
          : isDraggingActive ? "border-slate-200 cursor-grab opacity-90"
          : "border-slate-200 hover:shadow-md cursor-grab"
        } group`}
    >
      <div className="flex items-start gap-2">
        {/* drag handle */}
        <div className="mt-0.5 shrink-0 text-slate-300 group-hover:text-slate-400 transition-colors cursor-grab">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <circle cx="5" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/>
            <circle cx="10" cy="4" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="10" cy="12" r="1.2"/>
          </svg>
        </div>
        <Link
          href={`/projects/${projectId}/stories/${story.id}`}
          className="flex-1 min-w-0 text-sm font-medium text-slate-800 hover:text-violet-700 transition-colors leading-snug"
        >
          {story.name}
        </Link>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM14.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
          </button>
          {menuOpen && (
            <StatusMenu
              current={story.status as Status}
              statuses={allStatuses}
              onSelect={(s) => { onStatusChange(story.id, s); setMenuOpen(false); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 ml-5">
        <div className="flex items-center gap-2">
          {story.story_points != null && (
            <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded-full">
              {story.story_points} pts
            </span>
          )}
          {taskProgress !== null && taskProgress.total > 0 && (
            <span className="text-xs text-slate-400">
              {taskProgress.done}/{taskProgress.total} tasks
            </span>
          )}
        </div>
        {assignees.length > 0 && <AssigneeAvatars members={assignees} />}
      </div>
    </div>
  );
}

// ── Assignee Avatars ──────────────────────────────────────────────────────────

function MemberAvatar({ member }: { member: TeamMember }) {
  const [broken, setBroken] = useState(false);
  const initials = (
    `${member.user.first_name?.charAt(0) ?? ""}${member.user.last_name?.charAt(0) ?? ""}`
  ).toUpperCase() || member.user.username.charAt(0).toUpperCase();
  const label = `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim() || member.user.username;

  if (member.user.avatar_url && !broken) {
    return (
      <img
        src={member.user.avatar_url}
        alt={initials}
        title={label}
        className="w-5 h-5 rounded-full object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      title={label}
      className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold flex items-center justify-center select-none"
    >
      {initials}
    </span>
  );
}

function AssigneeAvatars({ members }: { members: TeamMember[] }) {
  const visible = members.slice(0, 4);
  const extra = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div key={m.user.id} className={`${i > 0 ? "-ml-1.5" : ""} ring-2 ring-white rounded-full`}>
          <MemberAvatar member={m} />
        </div>
      ))}
      {extra > 0 && (
        <div className="-ml-1.5 w-5 h-5 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center">
          <span className="text-[9px] font-semibold text-slate-600">+{extra}</span>
        </div>
      )}
    </div>
  );
}

function StatusMenu({
  current, statuses, onSelect, onClose,
}: {
  current: Status; statuses: Status[]; onSelect: (s: Status) => void; onClose: () => void;
}) {
  const t = useTranslations("board");
  useEffect(() => {
    const h = () => onClose();
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [onClose]);

  return (
    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20" onClick={(e) => e.stopPropagation()}>
      <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("moveTo")}</p>
      {statuses.filter((s) => s !== current).map((s) => (
        <button key={s} type="button" onClick={() => onSelect(s)} className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
          {s === "Not Started" ? "To Do" : s}
        </button>
      ))}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
