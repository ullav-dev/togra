"use client";

import { useEffect, useState } from "react";
import { listWorkflows, getWorkflow } from "@/lib/awe-api";
import type { Workflow, WorkflowWithTasks } from "@/lib/types";

interface Props {
  teamId: string;
  currentWorkflowId: string;
  token: string;
  onImport: (template: WorkflowWithTasks) => Promise<void>;
  onClose: () => void;
}

export default function ImportTemplateModal({ teamId, currentWorkflowId, token, onImport, onClose }: Props) {
  const [templates, setTemplates] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkflows(token, { team_id: teamId })
      .then((all) => setTemplates(all.filter((w) => w.is_template && w.id !== currentWorkflowId)))
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, [token, teamId, currentWorkflowId]);

  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    setError(null);
    try {
      const template = await getWorkflow(token, selected);
      await onImport(template);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-1">Import workflow template</h3>
        <p className="text-sm text-slate-500 mb-4">
          Steps from the template will be added to the canvas. Wire them into the flow afterwards.
        </p>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="space-y-2 max-h-72 overflow-y-auto mb-5">
          {loading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No templates found for this team. Create a workflow and mark it as a template in Obair.
            </p>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  selected === t.id
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    selected === t.id ? "border-violet-500 bg-violet-500" : "border-slate-300"
                  }`}>
                    {selected === t.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!selected || importing}
            className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {importing ? "Importing…" : "Import template"}
          </button>
        </div>
      </div>
    </div>
  );
}
