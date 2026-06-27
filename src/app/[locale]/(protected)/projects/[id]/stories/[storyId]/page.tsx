"use client";

import { useState, useEffect, use } from "react";
import { useResize } from "@/hooks/useResize";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import {
  getWorkflow, updateWorkflow,
  getTeam, listTeamRoles,
  listTaskTeamRoles,
} from "@/lib/awe-api";
import { getProject } from "@/lib/togra-api";
import { getStickyByWorkflow } from "@/lib/notes-api";
import type {
  WorkflowWithTasks, ProjectWithJobs,
  TeamMember, TeamRole, TaskTeamRole, StickyOrigin,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NotesPanel from "@/components/notes/NotesPanel";
import VisibilityToggle from "@/components/VisibilityToggle";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import ResearchPanel from "@/components/research/ResearchPanel";
import MarkdownEditor from "@/components/MarkdownEditor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string; storyId: string }>;
}) {
  const { id: projectId, storyId } = use(params);
  const { token } = useAuth();
  const { setCurrentProject } = useCurrentProject();
  const t = useTranslations("story");

  const [project, setProject] = useState<ProjectWithJobs | null>(null);
  const [story, setStory] = useState<WorkflowWithTasks | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsValue, setPointsValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>([]);
  const [taskTeamRoles, setTaskTeamRoles] = useState<Record<string, TaskTeamRole[]>>({});
  const [ideaOrigin, setIdeaOrigin] = useState<StickyOrigin | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getProject(token, projectId),
      getWorkflow(token, storyId),
    ]).then(async ([proj, wft]) => {
      setProject(proj);
      setCurrentProject({ id: proj.id, name: proj.name });
      setStory(wft);
      setNameValue(wft.name);
      setPointsValue(wft.story_points?.toString() ?? "");
      setDescriptionValue(wft.description ?? "");

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
      getStickyByWorkflow(token, storyId).then(setIdeaOrigin).catch(() => {});
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

  async function saveDescription() {
    if (!token || !story) return;
    setEditingDescription(false);
    if (descriptionValue === (story.description ?? "")) return;
    const updated = await updateWorkflow(token, storyId, { description: descriptionValue || undefined });
    setStory((prev) => prev ? { ...prev, ...updated } : prev);
  }

  const notesResize = useResize({ initial: 360, min: 180, max: 700, axis: "y" });
  const [researchOpen, setResearchOpen] = useState(false);

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
          <Link href={`/projects/${projectId}?tab=management`} className="hover:text-violet-700 transition-colors">{project?.name ?? "…"}</Link>
          {parentJobId && (() => {
            const parentJob = project?.jobs?.find((j) => j.id === parentJobId);
            const href = parentJob?.job_type === "backlog"
              ? `/projects/${projectId}?tab=management`
              : `/projects/${projectId}/jobs/${parentJobId}`;
            return (
              <>
                <span>/</span>
                <Link href={href} className="hover:text-violet-700 transition-colors">
                  {parentJob?.name ?? t("sprintFallback")}
                </Link>
              </>
            );
          })()}
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
          {story.ticket_type && (
            <div className="flex items-center gap-2 flex-wrap">
              {story.ticket_number != null && (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded">
                  ULLAV-{story.ticket_number}
                </span>
              )}
              <span className="inline-flex items-center text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">
                {story.ticket_type}
              </span>
              {story.priority && (
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded capitalize ${
                  story.priority === "critical" ? "bg-red-100 text-red-700" :
                  story.priority === "high"     ? "bg-orange-100 text-orange-700" :
                  story.priority === "medium"   ? "bg-yellow-100 text-yellow-700" :
                                                  "bg-slate-100 text-slate-600"
                }`}>
                  {story.priority}
                </span>
              )}
            </div>
          )}
          {ideaOrigin && (
            <Link
              href={`/projects/${projectId}/boards/${ideaOrigin.board_id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-full transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Z"/>
              </svg>
              {ideaOrigin.board_name}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setResearchOpen((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              researchOpen
                ? "bg-violet-600 text-white"
                : "bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Research
          </button>
        </div>
      </div>

      {/* Body: main content + optional research panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Description */}
          <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-3">
            {editingDescription ? (
              <div className="space-y-2">
                <MarkdownEditor
                  value={descriptionValue}
                  onChange={setDescriptionValue}
                  placeholder="Add a description…"
                  height={160}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveDescription}
                    className="text-xs font-medium bg-violet-600 text-white px-3 py-1 rounded hover:bg-violet-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingDescription(false); setDescriptionValue(story.description ?? ""); }}
                    className="text-xs font-medium text-slate-500 px-3 py-1 rounded hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingDescription(true)}
                className="cursor-pointer text-sm text-slate-700 hover:bg-slate-50 rounded px-1 -mx-1 transition-colors prose prose-sm prose-slate max-w-none"
              >
                {story.description
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{story.description}</ReactMarkdown>
                  : <span className="italic text-slate-400">Add a description…</span>
                }
              </div>
            )}
          </div>

          {/* Notes — resizable */}
          <div
            className="shrink-0 overflow-hidden bg-white border-b border-slate-200 px-6 py-4"
            style={{ height: notesResize.size }}
          >
            <NotesPanel entityType="workflow" entityId={storyId} isTeam={true} twoColumn autoSelectFirst members={teamMembers.map((m) => m.user)} />
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
          </div>
        </div>

        {/* Research panel */}
        {researchOpen && (
          <div className="w-96 shrink-0 overflow-hidden">
            <ResearchPanel
              token={token ?? ""}
              entityType="workflow"
              entityId={storyId}
              storyId={storyId}
              storyTitle={story.name}
              storyDescription={story.description ?? undefined}
              onClose={() => setResearchOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

