"use client";

import { useState, useEffect, use } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkflow, updateWorkflow, listTasks, updateTask } from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type { WorkflowWithTasks, Task, ProjectWithJobs, Status } from "@/lib/types";
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

        {/* Story points + visibility */}
        <div className="flex items-center gap-6 text-sm text-slate-500 flex-wrap">
          <div className="flex items-center gap-2">
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
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Workflow steps</h2>
          <p className="text-xs text-slate-400 mt-0.5">{story.tasks.length} tasks</p>
        </div>
        {story.tasks.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-400">No workflow steps yet.</p>
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

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <NotesPanel entityType="workflow" entityId={storyId} isTeam={!!story.team_id} />
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
