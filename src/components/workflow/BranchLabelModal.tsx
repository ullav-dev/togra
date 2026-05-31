"use client";

import { useState } from "react";

interface Props {
  fromTaskName: string;
  toTaskName: string;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

export default function BranchLabelModal({ fromTaskName, toTaskName, onConfirm, onCancel }: Props) {
  const [label, setLabel] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(label.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6">
        <h3 className="font-semibold text-slate-800 text-base mb-1">Branch label</h3>
        <p className="text-sm text-slate-500 mb-4">
          Connecting <span className="font-medium text-slate-700">{fromTaskName}</span>
          {" → "}
          <span className="font-medium text-slate-700">{toTaskName}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Yes, No, Approved…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <p className="text-xs text-slate-400">Leave blank for an unlabelled connection.</p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
