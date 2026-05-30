"use client";

import { useEffect, useRef, useState } from "react";
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listWorkflows(token, { team_id: teamId })
      .then((all) =>
        setTemplates(
          all
            .filter((w) => w.is_template && w.id !== currentWorkflowId)
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, [token, teamId, currentWorkflowId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(t: Workflow) {
    setSelected(t);
    setSearch(t.name);
    setOpen(false);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setSelected(null);
    setOpen(true);
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    setError(null);
    try {
      const template = await getWorkflow(token, selected.id);
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

        {/* Searchable combobox */}
        <div ref={dropdownRef} className="relative mb-5">
          <div className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 transition-colors ${open ? "border-violet-500 ring-1 ring-violet-500" : "border-slate-300"}`}>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
              <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder={loading ? "Loading templates…" : templates.length === 0 ? "No templates available" : "Search templates…"}
              disabled={loading || importing}
              className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 disabled:opacity-50"
            />
            {selected && (
              <button type="button" onClick={() => { setSelected(null); setSearch(""); setOpen(true); searchRef.current?.focus(); }}
                className="text-slate-300 hover:text-slate-500 transition-colors shrink-0">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L6 4.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 6l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 0 1-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 0 1 0-1.06z"/>
                </svg>
              </button>
            )}
          </div>

          {open && !loading && (
            <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 px-4 py-3">
                  {templates.length === 0 ? "No templates found for this team." : "No matches."}
                </p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(t); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-violet-50 transition-colors border-b border-slate-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-slate-800">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected preview */}
        {selected?.description && (
          <div className="mb-4 bg-slate-50 rounded-lg px-3 py-2.5">
            <p className="text-xs text-slate-500 leading-relaxed">{selected.description}</p>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} disabled={importing}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={() => void handleImport()} disabled={!selected || importing}
            className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40">
            {importing ? "Importing…" : "Import template"}
          </button>
        </div>
      </div>
    </div>
  );
}
