"use client";

import { useState, useEffect, use } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkflow, updateWorkflow, listTasks, updateTask } from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type { WorkflowWithTasks, Task, ProjectWithJobs, Status } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

const OBAIR_URL = process.env.NEXT_PUBLIC_OBAIR_URL ?? "http://localhost:3004";

export default function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; storyId: string }>;
}) {
  const { id: projectId, storyId } = use(params);
  const { token } = useAuth();

  const [project, setProject] = useState<ProjectWithJobs | null>(null);
  const [story, setStory] = useState<WorkflowWithTasks | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline editing state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsValue, setPointsValue] = useState("");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProject(token, projectId),
      getWorkflow(token, storyId),
    ]).then(([proj, wft]) => {
      setProject(proj);
      setStory(wft);
      setNameValue(wft.name);
      setPointsValue(wft.story_points?.toString() ?? "");
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

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading story…</div>;
  if (!story) return <div className="p-8 text-slate-500 text-sm">Story not found.</div>;

  const parentJobId = story.job_id;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6 flex-wrap">
        <Link href="/projects" className="hover:text-violet-700 transition-colors">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${projectId}`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
        {parentJobId && (
          <>
            <span>/</span>
            <Link href={`/projects/${projectId}/jobs/${parentJobId}`} className="hover:text-violet-700 transition-colors">
              {project?.jobs?.find((j) => j.id === parentJobId)?.name ?? "Sprint"}
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

        {/* Story points */}
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="font-medium">Story points:</span>
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

        {/* Open in Obair */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <a
            href={`${OBAIR_URL}/en/workflows/${storyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 transition-colors font-medium"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/></svg>
            Open full workflow in Obair
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-400"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>
          </a>
        </div>
      </div>

      {/* Tasks (workflow steps) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Workflow steps</h2>
          <p className="text-xs text-slate-400 mt-0.5">{story.tasks.length} tasks — manage task flow in Obair</p>
        </div>
        {story.tasks.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-400">No tasks yet. Open in Obair to add workflow steps.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {story.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onStatusChange={(s) => onTaskStatusChange(task, s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onStatusChange,
}: {
  task: Task;
  onStatusChange: (status: Status) => void;
}) {
  const statuses: Status[] = ["Not Started", "Ready", "In Progress", "On Hold", "Complete"];

  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{task.name}</p>
        {task.description && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{task.description}</p>
        )}
      </div>
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value as Status)}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
      >
        {statuses.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
