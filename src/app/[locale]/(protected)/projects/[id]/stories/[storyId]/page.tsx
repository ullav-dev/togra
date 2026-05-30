"use client";

import { useState, useEffect, use } from "react";
import { useResize } from "@/hooks/useResize";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorkflow, updateWorkflow,
  getTeam, listTeamRoles,
  listTaskTeamRoles,
} from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import type {
  WorkflowWithTasks, ProjectWithJobs,
  TeamMember, TeamRole, TaskTeamRole,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NotesPanel from "@/components/notes/NotesPanel";
import VisibilityToggle from "@/components/VisibilityToggle";
import WorkflowCanvas from "@/components/WorkflowCanvas";

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

  const notesResize = useResize({ initial: 360, min: 180, max: 700, axis: "y" });

  if (loading) return <div className="p-8 text-slate-400 text-sm">{t("loading")}</div>;
  if (!story) return <div className="p-8 text-slate-500 text-sm">{t("notFound")}</div>;

  const parentJobId = story.job_id;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header strip */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-3 flex-wrap">
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

        {/* Story name + meta */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
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
                className="text-xl font-bold text-slate-800 cursor-pointer hover:text-violet-700 transition-colors leading-snug"
                onClick={() => setEditingName(true)}
                title="Click to edit"
              >
                {story.name}
              </h1>
            )}
          </div>
          <StatusPill status={story.status} />
        </div>

        <div className="flex items-center gap-6 text-sm text-slate-500 mt-3 flex-wrap">
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

      {/* Notes — resizable, fills from header down */}
      <div
        className="shrink-0 overflow-hidden bg-white border-b border-slate-200 px-6 py-4"
        style={{ height: notesResize.size }}
      >
        <NotesPanel entityType="workflow" entityId={storyId} isTeam={true} twoColumn members={teamMembers.map((m) => m.user)} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={notesResize.onMouseDown}
        className="h-2 shrink-0 bg-slate-100 hover:bg-violet-100 cursor-row-resize flex items-center justify-center group transition-colors"
        title="Drag to resize"
      >
        <div className="w-8 h-0.5 bg-slate-300 group-hover:bg-violet-400 rounded-full transition-colors" />
      </div>

      {/* Workflow canvas — fills remaining space */}
      <div className="flex-1 overflow-hidden bg-slate-50">
        {story.tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">{t("noSteps")}</div>
        ) : (
          <WorkflowCanvas
            workflow={story}
            teamMembers={teamMembers}
            teamRoles={teamRoles}
            taskTeamRoles={taskTeamRoles}
            token={token ?? ""}
            onTaskUpdated={(updated) =>
              setStory((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === updated.id ? updated : t) } : prev)
            }
          />
        )}
      </div>
    </div>
  );
}

