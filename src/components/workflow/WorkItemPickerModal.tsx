"use client";

import { useEffect, useState } from "react";
import type { WorkItem, InstantiateWorkItemResponse } from "@/lib/types";
import { listWorkItems, instantiateWorkItem } from "@/lib/awe-api";

interface Props {
  workflowId: string;
  canvasCenter: { x: number; y: number };
  token: string;
  onInstantiated: (result: InstantiateWorkItemResponse) => void;
  onClose: () => void;
}

export default function WorkItemPickerModal({ workflowId, canvasCenter, token, onInstantiated, onClose }: Props) {
  const [items, setItems]         = useState<WorkItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [instantiating, setInstantiating] = useState<string | null>(null);

  useEffect(() => {
    listWorkItems(token)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSelect(item: WorkItem) {
    if (instantiating) return;
    setInstantiating(item.id);
    setError(null);
    try {
      const result = await instantiateWorkItem(token, item.id, {
        workflow_id: workflowId,
        canvas_x: canvasCenter.x,
        canvas_y: canvasCenter.y,
      });
      onInstantiated(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step");
      setInstantiating(null);
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = items.filter((item) => !q || item.name.toLowerCase().includes(q));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-800 text-base">Work Item Library</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select a work item to add to the workflow</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none transition-colors">×</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5 L14 14" strokeLinecap="round"/>
            </svg>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work items…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error && (
            <div className="mx-2 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-xs">{error}</div>
          )}
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              {q ? `No work items matching "${q}"` : "No work items available."}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleSelect(item)}
                  disabled={!!instantiating}
                  className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 hover:border-violet-300 hover:bg-violet-50 transition-colors disabled:opacity-50 group"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 group-hover:text-violet-700 transition-colors">
                      {instantiating === item.id ? "Adding…" : item.name}
                    </span>
                    <TypeBadge type={item.task_type} />
                    {item.is_locked && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">Locked</span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (type === "decision") return <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium shrink-0">◆ Decision</span>;
  if (type === "automated") return <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium shrink-0">⚡ Automated</span>;
  return null;
}
