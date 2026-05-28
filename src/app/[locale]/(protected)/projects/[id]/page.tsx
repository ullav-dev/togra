"use client";

import { useState, useEffect, use, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getProject, updateProject, deleteProject } from "@/lib/togra-api";
import {
  createJob,
  deleteJob,
  updateJob,
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflowFromTemplate,
  createTask,
  createNote,
} from "@/lib/awe-api";
import MarkdownEditor from "@/components/MarkdownEditor";
import { useRouter } from "@/i18n/navigation";
import type { ProjectWithJobs, Job, Workflow } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import ConfirmDialog from "@/components/ConfirmDialog";
import VisibilityToggle from "@/components/VisibilityToggle";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, roles } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<ProjectWithJobs | null>(null);
  const [backlogStories, setBacklogStories] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [confirmDeleteSprintId, setConfirmDeleteSprintId] = useState<string | null>(null);

  const backlogJob = project?.jobs.find((j) => j.job_type === "backlog") ?? null;
  const sprints = (project?.jobs ?? [])
    .filter((j) => j.job_type === "sprint")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  useEffect(() => {
    if (!token) return;
    getProject(token, id).then(async (proj) => {
      setProject(proj);
      const bl = proj.jobs.find((j) => j.job_type === "backlog");
      const [stories, tmpl] = await Promise.all([
        bl ? listWorkflows(token, { job_id: bl.id }) : Promise.resolve([]),
        listWorkflows(token),  // all accessible workflows for template picker
      ]);
      setBacklogStories(stories);
      setTemplates(tmpl.filter((w) => w.is_template));
    }).finally(() => setLoading(false));
  }, [token, id]);

  // Load stories for a given sprint
  async function loadSprintStories(sprintId: string): Promise<Workflow[]> {
    if (!token) return [];
    return listWorkflows(token, { job_id: sprintId });
  }

  async function onStoryCreated(story: Workflow) {
    setBacklogStories((prev) => [...prev, story]);
  }

  async function onStoryMoved(storyId: string, targetJobId: string | null) {
    if (!token) return;
    const targetId = targetJobId ?? backlogJob?.id;
    if (!targetId) return;
    await updateWorkflow(token, storyId, { job_id: targetId });
    // Refresh stories for backlog and all sprints
    if (backlogJob) {
      setBacklogStories(await listWorkflows(token, { job_id: backlogJob.id }));
    }
    setProject((prev) => prev ? { ...prev, _refresh: Date.now() } as typeof prev : prev);
  }

  async function onStoryDeleted(storyId: string) {
    if (!token) return;
    await deleteWorkflow(token, storyId);
    setBacklogStories((prev) => prev.filter((s) => s.id !== storyId));
  }

  async function onSprintCreated(sprint: Job) {
    setProject((prev) =>
      prev ? { ...prev, jobs: [...prev.jobs, sprint] } : prev
    );
  }

  async function doDeleteSprint(sprintId: string) {
    if (!token) return;
    if (backlogJob) {
      const sprintStories = await listWorkflows(token, { job_id: sprintId });
      await Promise.all(
        sprintStories.map((s) => updateWorkflow(token, s.id, { job_id: backlogJob.id }))
      );
      setBacklogStories(await listWorkflows(token, { job_id: backlogJob.id }));
    }
    await deleteJob(token, sprintId);
    setProject((prev) =>
      prev ? { ...prev, jobs: prev.jobs.filter((j) => j.id !== sprintId) } : prev
    );
  }

  async function onRenameProject() {
    if (!token || !project || !renameValue.trim() || renameValue.trim() === project.name) {
      setRenamingProject(false);
      return;
    }
    const updated = await updateProject(token, id, { name: renameValue.trim() });
    setProject((prev) => prev ? { ...prev, name: updated.name } : prev);
    setRenamingProject(false);
  }

  async function doDeleteProject() {
    if (!token) return;
    await deleteProject(token, id);
    router.replace("/projects");
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!project) return <div className="p-8 text-slate-500 text-sm">Project not found.</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-violet-700 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{project.name}</span>
        </nav>
        <div className="flex items-center gap-3">
          {renamingProject ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={onRenameProject}
              onKeyDown={(e) => { if (e.key === "Enter") onRenameProject(); if (e.key === "Escape") setRenamingProject(false); }}
              className="text-xl font-bold text-slate-800 border-b-2 border-violet-400 outline-none bg-transparent"
            />
          ) : (
            <h1
              className="text-xl font-bold text-slate-800 cursor-pointer hover:text-violet-700 transition-colors"
              onClick={() => { setRenameValue(project.name); setRenamingProject(true); }}
              title="Click to rename"
            >
              {project.name}
            </h1>
          )}
          <StatusPill status={project.status} />
          {project.description && (
            <span className="text-sm text-slate-400 truncate max-w-xs">{project.description}</span>
          )}
          {canDeleteProject(roles, token, project.team_id) && (
            <button
              type="button"
              onClick={() => setConfirmDeleteProject(true)}
              className="ml-auto text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
              title="Delete project"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Backlog */}
        <BacklogPanel
          backlogJob={backlogJob}
          stories={backlogStories}
          sprints={sprints}
          templates={templates}
          token={token!}
          projectId={id}
          onStoryCreated={onStoryCreated}
          onStoryMoved={onStoryMoved}
          onStoryDeleted={onStoryDeleted}
        />

        {/* Divider */}
        <div className="w-px bg-slate-200 shrink-0" />

        {/* Right — Sprints */}
        <SprintsPanel
          projectId={id}
          sprints={sprints}
          backlogJob={backlogJob}
          token={token!}
          loadSprintStories={loadSprintStories}
          onSprintCreated={onSprintCreated}
          onSprintDeleted={(sprintId) => setConfirmDeleteSprintId(sprintId)}
          onSprintUpdated={(sprintId, patch) => {
            setProject((prev) =>
              prev ? { ...prev, jobs: prev.jobs.map((j) => j.id === sprintId ? { ...j, ...patch } : j) } : prev
            );
          }}
          onStoryMoved={onStoryMoved}
        />
      </div>

      {confirmDeleteProject && project && (
        <ConfirmDialog
          title={`Delete "${project.name}"?`}
          message="All sprints, stories, and notes in this project will be permanently deleted. This cannot be undone."
          confirmLabel="Delete project"
          onConfirm={() => { setConfirmDeleteProject(false); doDeleteProject(); }}
          onCancel={() => setConfirmDeleteProject(false)}
        />
      )}

      {confirmDeleteSprintId && (
        <ConfirmDialog
          title="Delete sprint?"
          message="Stories in this sprint will be moved back to the Backlog."
          confirmLabel="Delete sprint"
          onConfirm={() => { const id = confirmDeleteSprintId; setConfirmDeleteSprintId(null); doDeleteSprint(id); }}
          onCancel={() => setConfirmDeleteSprintId(null)}
        />
      )}
    </div>
  );
}

// ── Permission helper ─────────────────────────────────────────────────────────

function canDeleteProject(roles: string[], token: string | null, teamId: string | null): boolean {
  if (roles.includes("admin")) return true;
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const teams = (payload.teams ?? {}) as Record<string, { role: string; products: string[] }>;
    return Object.entries(teams).some(([tid, t]) =>
      t.role === "owner" && (teamId === null || tid === teamId)
    );
  } catch { return false; }
}

// ── Backlog Panel ─────────────────────────────────────────────────────────────

function BacklogPanel({
  backlogJob,
  stories,
  sprints,
  templates,
  token,
  projectId,
  onStoryCreated,
  onStoryMoved,
  onStoryDeleted,
}: {
  backlogJob: Job | null;
  stories: Workflow[];
  sprints: Job[];
  templates: Workflow[];
  token: string;
  projectId: string;
  onStoryCreated: (s: Workflow) => void;
  onStoryMoved: (storyId: string, targetJobId: string | null) => void;
  onStoryDeleted: (storyId: string) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="w-80 shrink-0 flex flex-col bg-slate-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          {backlogJob ? (
            <Link href={`/projects/${projectId}/jobs/${backlogJob.id}`} className="text-sm font-semibold text-slate-700 hover:text-violet-700 transition-colors">
              Backlog →
            </Link>
          ) : (
            <h2 className="text-sm font-semibold text-slate-700">Backlog</h2>
          )}
          <p className="text-xs text-slate-400">{stories.length} {stories.length === 1 ? "story" : "stories"}</p>
        </div>
        <button
          type="button"
          disabled={!backlogJob}
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
          Add story
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {stories.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            {backlogJob ? "No stories yet — add the first one." : "No backlog found for this project."}
          </p>
        ) : (
          stories.map((story) => (
            <BacklogStoryCard
              key={story.id}
              story={story}
              sprints={sprints}
              projectId={projectId}
              onMoveToSprint={(sprintId) => onStoryMoved(story.id, sprintId)}
              onDelete={() => onStoryDeleted(story.id)}
            />
          ))
        )}
      </div>

      {showCreate && backlogJob && (
        <CreateStoryModal
          jobId={backlogJob.id}
          templates={templates}
          token={token}
          onCreated={(s) => { onStoryCreated(s); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function BacklogStoryCard({
  story,
  sprints,
  projectId,
  onMoveToSprint,
  onDelete,
}: {
  story: Workflow;
  sprints: Job[];
  projectId: string;
  onMoveToSprint: (sprintId: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 hover:border-violet-200 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/projects/${projectId}/stories/${story.id}`}
          className="flex-1 min-w-0 text-sm font-medium text-slate-800 hover:text-violet-700 transition-colors leading-snug"
        >
          {story.name}
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {story.story_points != null && (
            <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded-full">
              {story.story_points}
            </span>
          )}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM14.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20">
                {sprints.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Move to sprint</p>
                    {sprints.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => { onMoveToSprint(sp.id); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors truncate"
                      >
                        {sp.name}
                      </button>
                    ))}
                    <div className="my-1 border-t border-slate-100" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete story
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <StatusPill status={story.status} />
      </div>
    </div>
  );
}

// ── Sprints Panel ─────────────────────────────────────────────────────────────

function SprintsPanel({
  projectId,
  sprints,
  backlogJob,
  token,
  loadSprintStories,
  onSprintCreated,
  onSprintDeleted,
  onSprintUpdated,
  onStoryMoved,
}: {
  projectId: string;
  sprints: Job[];
  backlogJob: Job | null;
  token: string;
  loadSprintStories: (sprintId: string) => Promise<Workflow[]>;
  onSprintCreated: (sprint: Job) => void;
  onSprintDeleted: (sprintId: string) => void;
  onSprintUpdated: (sprintId: string, patch: Partial<Job>) => void;
  onStoryMoved: (storyId: string, targetJobId: string | null) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">Sprints</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
          New sprint
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {sprints.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm mb-1">No sprints yet.</p>
            <p className="text-xs">Create a sprint to start planning.</p>
          </div>
        ) : (
          sprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              projectId={projectId}
              backlogJobId={backlogJob?.id ?? null}
              token={token}
              loadStories={loadSprintStories}
              onDelete={() => onSprintDeleted(sprint.id)}
              onUpdate={(patch) => onSprintUpdated(sprint.id, patch)}
              onMoveToBacklog={(storyId) => onStoryMoved(storyId, null)}
            />
          ))
        )}
      </div>

      {showCreate && (
        <CreateSprintModal
          projectId={projectId}
          token={token}
          onCreated={(s) => { onSprintCreated(s); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function SprintCard({
  sprint: initialSprint,
  projectId,
  backlogJobId,
  token,
  loadStories,
  onDelete,
  onUpdate,
  onMoveToBacklog,
}: {
  sprint: Job;
  projectId: string;
  backlogJobId: string | null;
  token: string;
  loadStories: (sprintId: string) => Promise<Workflow[]>;
  onDelete: () => void;
  onUpdate: (patch: Partial<Job>) => void;
  onMoveToBacklog: (storyId: string) => void;
}) {
  const [sprint, setSprint] = useState(initialSprint);
  const [stories, setStories] = useState<Workflow[] | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => { setSprint(initialSprint); }, [initialSprint]);

  useEffect(() => {
    if (expanded && stories === null) {
      loadStories(sprint.id).then(setStories);
    }
  }, [expanded, stories, sprint.id, loadStories]);

  const totalPoints = (stories ?? []).reduce((sum, s) => sum + (s.story_points ?? 0), 0);

  const dateRange = sprint.start_date && sprint.end_date
    ? `${fmtDate(sprint.start_date)} – ${fmtDate(sprint.end_date)}`
    : sprint.start_date ? `From ${fmtDate(sprint.start_date)}` : null;

  async function applyStatusChange(newStatus: string) {
    const updated = await updateJob(token, sprint.id, { status: newStatus });
    setSprint(updated);
    onUpdate({ status: updated.status });
  }

  async function saveEdit(name: string, startDate: string, endDate: string) {
    const updated = await updateJob(token, sprint.id, {
      name: name.trim(),
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    });
    setSprint(updated);
    onUpdate({ name: updated.name, start_date: updated.start_date, end_date: updated.end_date });
    setShowEdit(false);
  }

  return (
    <>
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Sprint header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className={`w-4 h-4 transition-transform ${expanded ? "" : "-rotate-90"}`}><path d="M4 6l4 4 4-4H4z"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800">{sprint.name}</span>
          {dateRange && <span className="ml-2 text-xs text-slate-400">{dateRange}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stories !== null && (
            <span className="text-xs text-slate-400">{stories.length} {stories.length === 1 ? "story" : "stories"}{totalPoints > 0 ? ` · ${totalPoints} pts` : ""}</span>
          )}
          <StatusPill status={sprint.status} />
          {sprint.status === "Not Started" && (
            <button type="button" onClick={() => setConfirmStart(true)}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 hover:bg-emerald-50 px-2 py-0.5 rounded-md transition-colors">
              Start
            </button>
          )}
          {sprint.status === "In Progress" && (
            <button type="button" onClick={() => setConfirmComplete(true)}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 border border-blue-300 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-colors">
              Complete
            </button>
          )}
          <Link href={`/projects/${projectId}/jobs/${sprint.id}`} className="text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors">
            Board →
          </Link>
          <button type="button" onClick={() => setShowEdit(true)} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" title="Edit sprint">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064L11.19 6.25Z"/></svg>
          </button>
          <button type="button" onClick={onDelete} className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded" title="Delete sprint">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/></svg>
          </button>
        </div>
      </div>

      {/* Sprint stories */}
      {expanded && (
        <div className="divide-y divide-slate-100">
          {stories === null ? (
            <p className="px-4 py-3 text-xs text-slate-400">Loading…</p>
          ) : stories.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 italic">No stories in this sprint yet.</p>
          ) : (
            stories.map((story) => (
              <SprintStoryRow key={story.id} story={story} projectId={projectId}
                onMoveToBacklog={backlogJobId ? () => onMoveToBacklog(story.id) : undefined} />
            ))
          )}
        </div>
      )}
    </div>

    {showEdit && (
      <EditSprintModal sprint={sprint} onSave={saveEdit} onClose={() => setShowEdit(false)} />
    )}
    {confirmStart && (
      <ConfirmDialog
        title={`Start "${sprint.name}"?`}
        message="The sprint status will be set to In Progress."
        confirmLabel="Start sprint"
        variant="primary"
        onConfirm={() => { setConfirmStart(false); applyStatusChange("In Progress"); }}
        onCancel={() => setConfirmStart(false)}
      />
    )}
    {confirmComplete && (
      <ConfirmDialog
        title={`Complete "${sprint.name}"?`}
        message="The sprint status will be set to Complete. Unfinished stories will remain in the sprint."
        confirmLabel="Complete sprint"
        variant="primary"
        onConfirm={() => { setConfirmComplete(false); applyStatusChange("Complete"); }}
        onCancel={() => setConfirmComplete(false)}
      />
    )}
    </>
  );
}

function EditSprintModal({
  sprint,
  onSave,
  onClose,
}: {
  sprint: Job;
  onSave: (name: string, startDate: string, endDate: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [startDate, setStartDate] = useState(sprint.start_date ?? "");
  const [endDate, setEndDate] = useState(sprint.end_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try { await onSave(name, startDate, endDate); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-5">Edit sprint</h3>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Sprint name</label>
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">End date</label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SprintStoryRow({
  story,
  projectId,
  onMoveToBacklog,
}: {
  story: Workflow;
  projectId: string;
  onMoveToBacklog?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 group">
      <Link
        href={`/projects/${projectId}/stories/${story.id}`}
        className="flex-1 min-w-0 text-sm text-slate-700 hover:text-violet-700 transition-colors truncate"
      >
        {story.name}
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {story.story_points != null && (
          <span className="text-xs bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 rounded-full">
            {story.story_points}
          </span>
        )}
        <StatusPill status={story.status} />
        {onMoveToBacklog && (
          <button
            type="button"
            onClick={onMoveToBacklog}
            className="text-xs text-slate-400 hover:text-violet-600 transition-colors opacity-0 group-hover:opacity-100"
            title="Move to backlog"
          >
            ← Backlog
          </button>
        )}
      </div>
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function CreateStoryModal({
  jobId,
  templates,
  token,
  onCreated,
  onClose,
}: {
  jobId: string;
  templates: Workflow[];
  token: string;
  onCreated: (s: Workflow) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [points, setPoints] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      let story: Workflow;
      const pts = points ? parseInt(points, 10) : undefined;

      if (templateId) {
        story = await cloneWorkflowFromTemplate(token, jobId, templateId);
        story = await updateWorkflow(token, story.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          story_points: pts,
          is_shared: isShared,
        });
      } else {
        story = await createWorkflow(token, {
          name: name.trim(),
          job_id: jobId,
          description: description.trim() || undefined,
          story_points: pts,
          is_shared: isShared,
        });
        await createTask(token, { name: "Define", workflow_id: story.id });
      }

      // Create the main Note if body was provided — inherits the same visibility as the story
      if (noteBody.trim()) {
        await createNote(token, {
          entity_type: "workflow",
          entity_id: story.id,
          title: name.trim(),
          body: noteBody.trim(),
          is_shared: isShared,
        });
      }

      onCreated(story);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-4">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">Add story to Backlog</h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="story-name" className="text-sm font-medium text-slate-700">Story name</label>
            <input
              id="story-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. Implement login flow"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="story-desc" className="text-sm font-medium text-slate-700">
              Short description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="story-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="One-line summary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Story notes <span className="text-slate-400 font-normal">(optional — markdown)</span>
            </label>
            <MarkdownEditor value={noteBody} onChange={setNoteBody} placeholder="Acceptance criteria, context, links…" height={200} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="story-points" className="text-sm font-medium text-slate-700">
              Story points <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="story-points"
              type="number"
              min="0"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 w-28"
              placeholder="e.g. 3"
            />
          </div>
          {templates.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="story-template" className="text-sm font-medium text-slate-700">
                Workflow template <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                id="story-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Blank (Define task only)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400">Templates are managed in Obair.</p>
            </div>
          )}
          <VisibilityToggle isShared={isShared} onChange={setIsShared} />
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {submitting ? "Creating…" : "Add to Backlog"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateSprintModal({
  projectId,
  token,
  onCreated,
  onClose,
}: {
  projectId: string;
  token: string;
  onCreated: (sprint: Job) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const sprint = await createJob(token, {
        name: name.trim(),
        project_id: projectId,
        job_type: "sprint",
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      onCreated(sprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sprint");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">New sprint</h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="sprint-name" className="text-sm font-medium text-slate-700">Sprint name</label>
            <input
              id="sprint-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. Sprint 1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="sprint-start" className="text-sm font-medium text-slate-700">Start date</label>
              <input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sprint-end" className="text-sm font-medium text-slate-700">End date</label>
              <input
                id="sprint-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {submitting ? "Creating…" : "Create sprint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
