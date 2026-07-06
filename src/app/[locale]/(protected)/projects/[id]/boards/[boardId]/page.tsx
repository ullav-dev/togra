"use client";

import { use, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import { Link } from "@/i18n/navigation";
import { getIdeaBoard, listStickies, listNoteLinks, listShapes } from "@/lib/notes-api";
import { getProject, } from "@/lib/togra-api";
import { listWorkflows, getTeam } from "@/lib/awe-api";
import type { IdeaBoard, StickyNote, NoteLink, Job, Workflow, BoardShape, TeamMember } from "@/lib/types";
import IdeaBoardCanvas from "@/components/ideas/IdeaBoard";
import ResearchPanel from "@/components/research/ResearchPanel";

export default function IdeaBoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id: projectId, boardId } = use(params);
  const { token } = useAuth();
  const { setCurrentProject } = useCurrentProject();

  const [board, setBoard] = useState<IdeaBoard | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [shapes, setShapes] = useState<BoardShape[]>([]);
  const [backlogJob, setBacklogJob] = useState<Job | null>(null);
  const [templates, setTemplates] = useState<Workflow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getIdeaBoard(token, boardId),
      listStickies(token, boardId),
      listNoteLinks(token, boardId),
      listShapes(token, boardId),
      getProject(token, projectId),
    ])
      .then(async ([b, s, l, sh, proj]) => {
        setBoard(b);
        setStickies(s);
        setLinks(l);
        setShapes(sh);
        setCurrentProject({ id: proj.id, name: proj.name });
        localStorage.setItem(`togra_last_idea_board_${projectId}`, boardId);
        const bl = proj.jobs.find((j: Job) => j.job_type === "backlog") ?? null;
        setBacklogJob(bl);
        if (proj.team_id) {
          const tmpl = await listWorkflows(token, { team_id: proj.team_id }).catch(() => []);
          setTemplates(tmpl.filter((w: Workflow) => w.is_template));
          const team = await getTeam(token, proj.team_id).catch(() => null);
          if (team) setTeamMembers(team.members.filter((m) => m.status === "active"));
        }
      })
      .finally(() => setLoading(false));
  }, [token, boardId, projectId]);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading board…</div>;
  if (!board) return <div className="p-8 text-slate-500 text-sm">Board not found.</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-0.5">
          <Link href="/projects" className="hover:text-violet-700 transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-violet-700 transition-colors">
            Project
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}?tab=ideas`} className="hover:text-violet-700 transition-colors">
            Ideas
          </Link>
          <span>/</span>
          <span className="text-slate-700 font-medium">{board.name}</span>
        </nav>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-violet-500">
            <path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Z"/>
          </svg>
          <h1 className="text-base font-bold text-slate-800">{board.name}</h1>
          <button
            type="button"
            onClick={() => setResearchOpen((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
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

      {/* Canvas + Research panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <IdeaBoardCanvas
            boardId={boardId}
            token={token!}
            projectId={projectId}
            backlogJobId={backlogJob?.id ?? null}
            templates={templates}
            initialStickies={stickies}
            initialLinks={links}
            initialShapes={shapes}
            teamMembers={teamMembers}
          />
        </div>
        {researchOpen && (
          <div className="w-96 shrink-0 overflow-hidden">
            <ResearchPanel
              token={token ?? ""}
              entityType="job"
              entityId={boardId}
              onClose={() => setResearchOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
