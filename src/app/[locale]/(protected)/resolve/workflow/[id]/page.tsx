"use client";

import { useEffect, use } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getWorkflow, getJob } from "@/lib/awe-api";

/**
 * `/resolve/workflow/{id}` — id-only deep link into a story (workflow).
 * See `resolve/task/[id]/page.tsx` for the fuller rationale; this is the
 * same idea one level up the chain (a workflow reference already *is* the
 * story, it just still needs the project id to build the real route).
 */
export default function ResolveWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const workflow = await getWorkflow(token, id);
        if (!workflow.job_id) throw new Error("workflow has no job");
        const job = await getJob(token, workflow.job_id);
        if (!job.project_id) throw new Error("job has no project");
        if (!cancelled) {
          router.replace(`/projects/${job.project_id}/stories/${id}`);
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
