// Human-readable references for project-linked tasks/workflows, e.g. "P1-0004" / "P1-W0004".
// Mirrors cunav's `ticket-id.ts` pattern, except the prefix comes from the project
// (`project_code`) rather than a static env var. Computed client-side from the separate
// `project_code` + `task_number`/`workflow_number` fields (not stored pre-formatted server-side),
// so renaming a project's code updates every reference for free.

export function taskRef(
  projectCode: string | null | undefined,
  taskNumber: number | null | undefined,
): string | null {
  if (!projectCode || !taskNumber) return null;
  return `${projectCode}-${String(taskNumber).padStart(4, "0")}`;
}

export function workflowRef(
  projectCode: string | null | undefined,
  workflowNumber: number | null | undefined,
): string | null {
  if (!projectCode || !workflowNumber) return null;
  return `${projectCode}-W${String(workflowNumber).padStart(4, "0")}`;
}
