"use client";

import { useState, useEffect, use } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getProject } from "@/lib/togra-api";
import { createJob, deleteJob } from "@/lib/awe-api";
import { getMyTeams } from "@/lib/awe-api";
import { getObairTeamIds } from "@/lib/auth-api";
import type { ProjectWithJobs, Job, TeamSummary } from "@/lib/types";
import StatusPill from "@/components/StatusPill";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const [project, setProject] = useState<ProjectWithJobs | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([getProject(token, id), getMyTeams(token)])
      .then(([p, ts]) => {
        setProject(p);
        const eligibleIds = getObairTeamIds(token);
        setTeams(ts.filter((t) => eligibleIds.includes(t.id)));
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  function onJobCreated(job: Job) {
    setProject((prev) => prev ? { ...prev, jobs: [job, ...prev.jobs] } : prev);
    setShowCreate(false);
  }

  async function onJobDelete(jobId: string) {
    if (!token || !confirm("Delete this job?")) return;
    await deleteJob(token, jobId);
    setProject((prev) => prev ? { ...prev, jobs: prev.jobs.filter((j) => j.id !== jobId) } : prev);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!project) return <div className="p-8 text-slate-500 text-sm">Project not found.</div>;

  const sprintJobs = project.jobs.filter((j) => j.job_type === "sprint");
  const kanbanJobs = project.jobs.filter((j) => j.job_type === "kanban");
  const otherJobs  = project.jobs.filter((j) => !j.job_type);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/projects" className="hover:text-violet-700 transition-colors">Projects</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{project.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-800">{project.name}</h1>
            <StatusPill status={project.status} />
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 max-w-xl">{project.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
          Add job
        </button>
      </div>

      {/* Jobs grouped by type */}
      {project.jobs.length === 0 ? (
        <EmptyJobs onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-8">
          {sprintJobs.length > 0 && (
            <JobSection title="Sprints" jobs={sprintJobs} projectId={id} onDelete={onJobDelete} />
          )}
          {kanbanJobs.length > 0 && (
            <JobSection title="Kanban Boards" jobs={kanbanJobs} projectId={id} onDelete={onJobDelete} />
          )}
          {otherJobs.length > 0 && (
            <JobSection title="Jobs" jobs={otherJobs} projectId={id} onDelete={onJobDelete} />
          )}
        </div>
      )}

      {showCreate && (
        <CreateJobModal
          projectId={id}
          teams={teams}
          token={token!}
          onCreated={onJobCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function JobSection({
  title,
  jobs,
  projectId,
  onDelete,
}: {
  title: string;
  jobs: Job[];
  projectId: string;
  onDelete: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-2">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} projectId={projectId} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function JobRow({
  job,
  projectId,
  onDelete,
}: {
  job: Job;
  projectId: string;
  onDelete: (id: string) => void;
}) {
  const typeLabel = job.job_type === "sprint" ? "Sprint" : job.job_type === "kanban" ? "Kanban" : "";
  const typeBadge =
    job.job_type === "sprint"
      ? "bg-indigo-50 text-indigo-700"
      : job.job_type === "kanban"
      ? "bg-teal-50 text-teal-700"
      : "bg-slate-100 text-slate-500";

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 group hover:border-violet-200 transition-colors">
      {typeLabel && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${typeBadge}`}>
          {typeLabel}
        </span>
      )}
      <Link
        href={`/projects/${projectId}/jobs/${job.id}`}
        className="flex-1 min-w-0 text-sm font-medium text-slate-700 hover:text-violet-700 transition-colors truncate"
      >
        {job.name}
      </Link>
      <StatusPill status={job.status} />
      <Link
        href={`/projects/${projectId}/jobs/${job.id}`}
        className="hidden group-hover:inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium shrink-0 transition-colors"
      >
        Open board
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>
      </Link>
      <button
        type="button"
        onClick={() => onDelete(job.id)}
        className="hidden group-hover:inline-flex text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
        title="Delete job"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/></svg>
      </button>
    </div>
  );
}

function EmptyJobs({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
      <p className="text-slate-500 text-sm mb-4">No jobs yet. Add a Sprint or Kanban board to get started.</p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        Add first job
      </button>
    </div>
  );
}

function CreateJobModal({
  projectId,
  teams,
  token,
  onCreated,
  onClose,
}: {
  projectId: string;
  teams: TeamSummary[];
  token: string;
  onCreated: (j: Job) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [jobType, setJobType] = useState<"sprint" | "kanban">("sprint");
  const [teamId, setTeamId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const j = await createJob(token, {
        name: name.trim(),
        project_id: projectId,
        team_id: teamId || undefined,
        job_type: jobType,
      });
      onCreated(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">Add job</h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="job-name" className="text-sm font-medium text-slate-700">Name</label>
            <input
              id="job-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="e.g. Sprint 1 or Backlog"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <div className="flex gap-3">
              {(["sprint", "kanban"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="job-type"
                    value={t}
                    checked={jobType === t}
                    onChange={() => setJobType(t)}
                    className="w-4 h-4 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-700 capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          {teams.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="job-team" className="text-sm font-medium text-slate-700">Team <span className="text-slate-400 font-normal">(optional)</span></label>
              <select
                id="job-team"
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
