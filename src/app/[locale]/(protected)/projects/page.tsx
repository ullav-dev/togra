"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { listProjects, createProjectWithBacklog, updateProject, deleteProject } from "@/lib/togra-api";
import { getMyTeams, getTeam } from "@/lib/awe-api";
import { getTograTeamIds } from "@/lib/auth-api";
import type { Project, TeamSummary, TeamMember } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import TograIcon from "@/components/TograIcon";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function ProjectsPage() {
  const { token } = useAuth();
  const t = useTranslations("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([listProjects(token), getMyTeams(token)])
      .then(([ps, ts]) => {
        setProjects(ps);
        const eligibleIds = getTograTeamIds(token);
        setTeams(ts.filter((t) => eligibleIds.includes(t.id)));
      })
      .finally(() => setLoading(false));
  }, [token]);

  function onProjectCreated(p: Project) {
    setProjects((prev) => [p, ...prev]);
    setShowCreate(false);
  }

  async function onProjectRenamed(id: string, name: string) {
    if (!token) return;
    const updated = await updateProject(token, id, { name });
    setProjects((prev) => prev.map((p) => p.id === updated.id ? { ...p, name: updated.name } : p));
  }

  async function onProjectDeleted(id: string) {
    if (!token) return;
    await deleteProject(token, id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <TograIcon className="w-9 h-9" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t("title")}</h1>
            <p className="text-sm text-slate-500">{t("subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/></svg>
          {t("newProject")}
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">{t("loading")}</div>
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onRename={onProjectRenamed} onDelete={onProjectDeleted} />
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

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: Project;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("projects");
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function commitRename() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project.name) onRename(project.id, trimmed);
    setRenaming(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    setConfirmingDelete(true);
  }

  return (
    <div className="relative bg-white rounded-xl border border-slate-200 p-5 hover:border-violet-300 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-2 mb-3">
        {renaming ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setNameValue(project.name); setRenaming(false); } }}
            onClick={(e) => e.preventDefault()}
            className="font-semibold text-slate-800 border-b-2 border-violet-400 outline-none bg-transparent flex-1 min-w-0"
          />
        ) : (
          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 group-hover:text-violet-700 transition-colors leading-tight">{project.name}</h2>
          </Link>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <StatusPill status={project.status} />
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setNameValue(project.name); setRenaming(true); }}
            className="p-1 text-slate-300 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100 rounded"
            title="Rename"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064L11.19 6.25Z"/></svg>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 rounded"
            title="Delete"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/></svg>
          </button>
        </div>
      </div>
      {project.description && (
        <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>
      )}
      <p className="text-xs text-slate-400">{t("created", { date: new Date(project.created_at).toLocaleDateString() })}</p>

      {confirmingDelete && (
        <ConfirmDialog
          title={t("deleteConfirmTitle", { name: project.name })}
          message={t("deleteConfirmMessage")}
          confirmLabel={t("deleteConfirmLabel")}
          onConfirm={() => { setConfirmingDelete(false); onDelete(project.id); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("projects");
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
        <TograIcon className="w-10 h-10" />
      </div>
      <h2 className="text-lg font-semibold text-slate-700 mb-2">{t("emptyTitle")}</h2>
      <p className="text-sm text-slate-500 mb-6">{t("emptySubtitle")}</p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {t("createProject")}
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
  const t = useTranslations("projects");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : "");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pmId, setPmId] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) { setMembers([]); setPmId(""); return; }
    setLoadingMembers(true);
    getTeam(token, teamId)
      .then((t) => {
        const active = t.members.filter((m) => m.status === "active");
        setMembers(active);
        setPmId("");
      })
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [teamId, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !teamId) return;
    setError(null);
    setSubmitting(true);
    try {
      const { project: p } = await createProjectWithBacklog(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        team_id: teamId,
        project_manager_id: pmId || undefined,
      });
      onCreated(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("modal.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">{t("modal.title")}</h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="proj-name" className="text-sm font-medium text-slate-700">{t("modal.nameLabel")}</label>
            <input id="proj-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)}
              className={inputCls} placeholder={t("modal.namePlaceholder")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="proj-desc" className="text-sm font-medium text-slate-700">
              {t("modal.descLabel")} <span className="text-slate-400 font-normal">{t("modal.optional")}</span>
            </label>
            <textarea id="proj-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} resize-none`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="proj-team" className="text-sm font-medium text-slate-700">{t("modal.teamLabel")}</label>
            <select id="proj-team" required value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputCls}>
              <option value="">{t("modal.teamPlaceholder")}</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {teamId && (
            <div className="flex flex-col gap-1">
              <label htmlFor="proj-pm" className="text-sm font-medium text-slate-700">
                {t("modal.pmLabel")} <span className="text-slate-400 font-normal">{t("modal.optional")}</span>
              </label>
              {loadingMembers ? (
                <p className="text-xs text-slate-400 py-2">{t("modal.loadingMembers")}</p>
              ) : (
                <select id="proj-pm" value={pmId} onChange={(e) => setPmId(e.target.value)} className={inputCls}>
                  <option value="">{t("modal.assignLater")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.username}{m.user.first_name ? ` (${m.user.first_name} ${m.user.last_name ?? ""})`.trimEnd() : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              {t("modal.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !teamId}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {submitting ? t("modal.creating") : t("modal.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
