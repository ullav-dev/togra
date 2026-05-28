"use client";

import { useState, useEffect, use } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getJob, listWorkflows, listTasks, createTask, updateTask } from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type { Job, Workflow, Task, Project, Status } from "@/lib/types";

const COLUMNS: { status: Status; label: string; colour: string; header: string }[] = [
  { status: "Not Started", label: "To Do",       colour: "bg-slate-50 border-slate-200",   header: "text-slate-500" },
  { status: "In Progress", label: "In Progress", colour: "bg-blue-50 border-blue-200",     header: "text-blue-700" },
  { status: "On Hold",     label: "On Hold",     colour: "bg-amber-50 border-amber-200",   header: "text-amber-700" },
  { status: "Complete",    label: "Done",        colour: "bg-emerald-50 border-emerald-200", header: "text-emerald-700" },
];

export default function BoardPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id: projectId, jobId } = use(params);
  const { token } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProject(token, projectId),
      getJob(token, jobId),
      listWorkflows(token, jobId),
    ]).then(([proj, j, wfs]) => {
      setProject(proj);
      setJob(j);
      setWorkflows(wfs);
      if (wfs.length > 0) setSelectedWorkflow(wfs[0].id);
    }).finally(() => setLoading(false));
  }, [token, projectId, jobId]);

  useEffect(() => {
    if (!token || !selectedWorkflow) return;
    listTasks(token, selectedWorkflow).then(setTasks);
  }, [token, selectedWorkflow]);

  async function onStatusChange(task: Task, newStatus: Status) {
    if (!token) return;
    const updated = await updateTask(token, task.id, { status: newStatus });
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function onTaskCreated(task: Task) {
    setTasks((prev) => [...prev, task]);
    setShowCreate(false);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading board…</div>;
  if (!job) return <div className="p-8 text-slate-500 text-sm">Job not found.</div>;

  const typeLabel = job.job_type === "sprint" ? "Sprint" : job.job_type === "kanban" ? "Kanban" : "Board";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/projects" className="hover:text-violet-700 transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{job.name}</span>
        </nav>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">{job.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              job.job_type === "sprint" ? "bg-indigo-50 text-indigo-700" :
              job.job_type === "kanban" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
            }`}>{typeLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {workflows.length > 1 && (
              <select
                value={selectedWorkflow ?? ""}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
            {selectedWorkflow && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
                New story
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Board */}
      {workflows.length === 0 ? (
        <NoWorkflows jobId={jobId} projectId={projectId} />
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full min-w-max">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.status);
              return (
                <KanbanColumn
                  key={col.status}
                  column={col}
                  tasks={colTasks}
                  allStatuses={COLUMNS.map((c) => c.status)}
                  onStatusChange={onStatusChange}
                />
              );
            })}
          </div>
        </div>
      )}

      {showCreate && selectedWorkflow && (
        <CreateStoryModal
          workflowId={selectedWorkflow}
          token={token!}
          onCreated={onTaskCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  allStatuses,
  onStatusChange,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  allStatuses: Status[];
  onStatusChange: (task: Task, status: Status) => void;
}) {
  return (
    <div className={`flex flex-col rounded-xl border ${column.colour} w-72 shrink-0`}>
      <div className="px-4 py-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${column.header}`}>{column.label}</span>
          <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 font-medium">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-24">
        {tasks.map((task) => (
          <StoryCard
            key={task.id}
            task={task}
            allStatuses={allStatuses}
            onStatusChange={onStatusChange}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No stories</p>
        )}
      </div>
    </div>
  );
}

function StoryCard({
  task,
  allStatuses,
  onStatusChange,
}: {
  task: Task;
  allStatuses: Status[];
  onStatusChange: (task: Task, status: Status) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 leading-snug">{task.name}</p>
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
              current={task.status as Status}
              statuses={allStatuses}
              onSelect={(s) => { onStatusChange(task, s); setMenuOpen(false); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
      {task.description && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>
      )}
      {task.assigned_to && (
        <p className="text-xs text-slate-400 mt-2">→ {task.assigned_to}</p>
      )}
    </div>
  );
}

function StatusMenu({
  current,
  statuses,
  onSelect,
  onClose,
}: {
  current: Status;
  statuses: Status[];
  onSelect: (s: Status) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [onClose]);

  return (
    <div
      className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Move to</p>
      {statuses.filter((s) => s !== current).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
        >
          {s === "Not Started" ? "To Do" : s}
        </button>
      ))}
    </div>
  );
}

function NoWorkflows({ jobId, projectId }: { jobId: string; projectId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <p className="text-slate-500 text-sm mb-2">No workflows on this job yet.</p>
        <p className="text-xs text-slate-400 mb-4">
          Create a workflow in Obair to define the task flow (e.g. Design → Dev → QA),
          then stories will appear here.
        </p>
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-violet-600 hover:text-violet-700 transition-colors"
        >
          ← Back to project
        </Link>
      </div>
    </div>
  );
}

function CreateStoryModal({
  workflowId,
  token,
  onCreated,
  onClose,
}: {
  workflowId: string;
  token: string;
  onCreated: (t: Task) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const t = await createTask(token, {
        name: name.trim(),
        workflow_id: workflowId,
        description: description.trim() || undefined,
      });
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">New story</h2>
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
            <label htmlFor="story-desc" className="text-sm font-medium text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              id="story-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
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
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
