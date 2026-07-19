"use client";

import { useEffect, use } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getTask, getWorkflow, getJob } from "@/lib/awe-api";

/**
 * `/resolve/task/{id}` — id-only deep link into a task's containing story.
 *
 * Togra has no bare `/tasks/{id}` page of its own (a task is always shown
 * inline within its story), and a task reference alone carries no project
 * id — so this resolves the task → workflow → job → project chain
 * client-side (three sequential authenticated calls, since there's no
 * single "task with its project" lookup) and redirects to the real
 * `projects/{projectId}/stories/{workflowId}` route.
 *
 * Built for lagan's PR-reference links (a lagan PR description mentioning
 * a Togra task reference has only the task's UUID to link to) — any other
 * caller wanting an id-only link into Togra can use this too.
 */
export default function ResolveTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const task = await getTask(token, id);
        const workflow = await getWorkflow(token, task.workflow_id);
        if (!workflow.job_id) throw new Error("workflow has no job");
        const job = await getJob(token, workflow.job_id);
        if (!job.project_id) throw new Error("job has no project");
        if (!cancelled) {
          router.replace(`/projects/${job.project_id}/stories/${task.workflow_id}`);
        }
      } catch {
        if (!cancelled) router.replace("/projects");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-400 text-sm">Redirecting…</p>
    </div>
  );
}
