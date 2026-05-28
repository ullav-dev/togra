"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listProjects, createProjectWithBacklog } from "@/lib/togra-api";
import { getMyTeams } from "@/lib/awe-api";
import { getObairTeamIds } from "@/lib/auth-api";
import type { Project, TeamSummary } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import TograIcon from "@/components/TograIcon";

export default function ProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([listProjects(token), getMyTeams(token)])
      .then(([ps, ts]) => {
        setProjects(ps);
        const eligibleIds = getObairTeamIds(token);
        setTeams(ts.filter((t) => eligibleIds.includes(t.id)));
      })
      .finally(() => setLoading(false));
  }, [token]);

  function onProjectCreated(p: Project) {
    setProjects((prev) => [p, ...prev]);
    setShowCreate(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <TograIcon className="w-9 h-9" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
            <p className="text-sm text-slate-500">All projects across your teams</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
          New project
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          teams={teams}
          token={token!}
          onCreated={onProjectCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-violet-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-slate-800 group-hover:text-violet-700 transition-colors leading-tight">
          {project.name}
        </h2>
        <StatusPill status={project.status} />
      </div>
      {project.description && (
        <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>
      )}
      <p className="text-xs text-slate-400">
        Created {new Date(project.created_at).toLocaleDateString()}
      </p>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
        <TograIcon className="w-10 h-10" />
      </div>
      <h2 className="text-lg font-semibold text-slate-700 mb-2">No projects yet</h2>
      <p className="text-sm text-slate-500 mb-6">Create your first project to get started.</p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        Create project
      </button>
    </div>
  );
}

function CreateProjectModal({
  teams,
  token,
  onCreated,
  onClose,
}: {
  teams: TeamSummary[];
  token: string;
  onCreated: (p: Project) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const { project: p } = await createProjectWithBacklog(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        team_id: teamId || undefined,
      });
      onCreated(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">New project</h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="proj-name" className="text-sm font-medium text-slate-700">Project name</label>
            <input
              id="proj-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. Ullav Portal v2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="proj-desc" className="text-sm font-medium text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              id="proj-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
          </div>
          {teams.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="proj-team" className="text-sm font-medium text-slate-700">Owner team <span className="text-slate-400 font-normal">(optional)</span></label>
              <select
                id="proj-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
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
