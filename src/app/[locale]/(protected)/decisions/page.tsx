"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyTeams, getTeam, listJobs, listWorkflows, listTasks,
  listTaskTeamRoles, listTaskOutgoingLinks, decideTask,
} from "@/lib/awe-api";
import type { Task, TaskLink, Workflow, Job } from "@/lib/types";

interface PendingDecision {
  task: Task;
  workflow: Workflow;
  job: Job;
  projectId: string | null;
  outgoingLinks: TaskLink[];
  assignedViaRole: boolean;
}

export default function DecisionsPage() {
  const { token, user } = useAuth();
  const t = useTranslations("decisions");

  const [decisions, setDecisions] = useState<PendingDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      // Collect user's team role IDs and team data
      const teamSummaries = await getMyTeams(token);
      const fullTeams = await Promise.all(teamSummaries.map((ts) => getTeam(token, ts.id)));

      const myRoleIds = new Set(
        fullTeams.flatMap((team) => {
          const me = team.members.find((m) => m.user.id === user.id);
          return me?.team_roles.map((r) => r.id) ?? [];
        })
      );

      // Collect all active jobs across all teams (de-dupe by job ID)
      const jobsPerTeam = await Promise.all(
        teamSummaries.map((ts) => listJobs(token, { team_id: ts.id }))
      );
      const jobMap = new Map<string, Job>();
      jobsPerTeam.flat().forEach((j) => {
        if (!j.archived && j.status !== "Complete" && j.status !== "Cancelled") {
          jobMap.set(j.id, j);
        }
      });
      const activeJobs = [...jobMap.values()];

      // Collect workflows for each active job
      const workflowsPerJob = await Promise.all(
        activeJobs.map((j) => listWorkflows(token, { job_id: j.id }))
      );
      const workflowJobPairs: { workflow: Workflow; job: Job }[] = workflowsPerJob.flatMap(
        (wfs, idx) => wfs.map((wf) => ({ workflow: wf, job: activeJobs[idx] }))
      );

      // Fetch tasks for each workflow and find Ready decision tasks
      const taskResults = await Promise.all(
        workflowJobPairs.map(async ({ workflow, job }) => {
          const tasks = await listTasks(token, workflow.id);
          const candidates = tasks.filter(
            (t) => t.task_type === "decision" && t.status === "Ready"
          );
          return candidates.map((task) => ({ task, workflow, job }));
        })
      );
      const candidates = taskResults.flat();

      // For each candidate check assignment (direct or via role) and load links
      const resolved = await Promise.all(
        candidates.map(async ({ task, workflow, job }) => {
          const directlyAssigned = task.assigned_to === user.id;

          let assignedViaRole = false;
          if (!directlyAssigned && myRoleIds.size > 0) {
            const taskRoles = await listTaskTeamRoles(token, task.id).catch(() => []);
            assignedViaRole = taskRoles.some((tr) => myRoleIds.has(tr.team_role_id));
          }

          if (!directlyAssigned && !assignedViaRole) return null;

          const outgoingLinks = await listTaskOutgoingLinks(token, task.id).catch(() => []);
          return {
            task,
            workflow,
            job,
            projectId: job.project_id ?? null,
            outgoingLinks,
            assignedViaRole,
          } satisfies PendingDecision;
        })
      );

      setDecisions(resolved.filter((d): d is PendingDecision => d !== null));
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => { load(); }, [load]);

  async function handleDecide(decision: PendingDecision, branchLabel: string) {
    if (!token) return;
    setDecidingId(decision.task.id);
    try {
      await decideTask(token, decision.task.id, branchLabel);
      setDecisions((prev) => prev.filter((d) => d.task.id !== decision.task.id));
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">{t("loading")}</div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-indigo-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-700 font-semibold">{t("empty")}</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((d) => (
            <DecisionCard
              key={d.task.id}
              decision={d}
              deciding={decidingId === d.task.id}
              onDecide={(label) => handleDecide(d, label)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Decision Card ─────────────────────────────────────────────────────────────

function DecisionCard({
  decision,
  deciding,
  onDecide,
}: {
  decision: PendingDecision;
  deciding: boolean;
  onDecide: (label: string) => void;
}) {
  const t = useTranslations("decisions");
  const { task, workflow, job, projectId, outgoingLinks, assignedViaRole } = decision;
  const labelLinks = outgoingLinks.filter((l) => l.branch_label);

  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-5 pt-5 pb-3 border-b border-indigo-100 bg-indigo-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-indigo-900 leading-snug">{task.name}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-indigo-600 flex-wrap">
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                  <rect x="1" y="3" width="12" height="10" rx="1.5" />
                  <path strokeLinecap="round" d="M4 1v4M10 1v4M1 7h12" />
                </svg>
                {t("storyLabel")}: {workflow.name}
              </span>
              <span className="text-indigo-300">·</span>
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                  <circle cx="7" cy="7" r="6" />
                  <path strokeLinecap="round" d="M7 4v3l2 1.5" />
                </svg>
                {t("sprintLabel")}: {job.name}
              </span>
            </div>
          </div>

          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            assignedViaRole
              ? "bg-violet-100 text-violet-700"
              : "bg-indigo-100 text-indigo-700"
          }`}>
            {assignedViaRole ? t("viaRole") : t("directlyAssigned")}
          </span>
        </div>

        {task.description && (
          <p className="text-xs text-indigo-700 mt-2 leading-relaxed">{task.description}</p>
        )}
      </div>

      {/* Decision actions */}
      <div className="px-5 py-4">
        {projectId ? (
          <p className="text-xs text-slate-400 mb-3">
            <Link
              href={`/projects/${projectId}/stories/${workflow.id}`}
              className="hover:text-violet-700 transition-colors underline underline-offset-2"
            >
              View story →
            </Link>
          </p>
        ) : null}

        <p className="text-xs font-semibold text-slate-600 mb-2">{t("decideHeading")}</p>

        {labelLinks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">{t("noLabels")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {labelLinks.map((l) => (
              <button
                key={l.branch_label}
                type="button"
                disabled={deciding}
                onClick={() => onDecide(l.branch_label!)}
                className="px-5 py-2.5 rounded-xl bg-white border-2 border-indigo-300 text-sm font-semibold text-indigo-700
                  hover:bg-indigo-600 hover:text-white hover:border-indigo-600 active:scale-95
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {deciding ? t("deciding") : l.branch_label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
