"use client";

import { useState } from "react";

interface Props {
  onAdd: (name: string, taskType: "standard" | "decision") => Promise<void>;
  onClose: () => void;
}

export default function AddStepModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<"standard" | "decision">("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim(), taskType);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add step");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-5">Add step</h3>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Step name
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Review documents"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Type
            </label>
            <div className="flex gap-2">
              {(["standard", "decision"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTaskType(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    taskType === t
                      ? "bg-violet-50 border-violet-400 text-violet-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t === "standard" ? "Standard" : "Decision ◇"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add step"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
