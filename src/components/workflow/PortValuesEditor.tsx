"use client";

import { useEffect, useState } from "react";
import { getTaskInputs, getTaskOutputs, patchTaskInputValues, patchTaskOutputValues } from "@/lib/awe-api";
import type { PortDirection, PortValueType, Task, TaskPortSpec } from "@/lib/types";

interface Props {
  taskId: string;
  token: string;
  /** Called with the server's response task after a save — e.g. saving a required
   * input can auto-promote the task from Not Started to Ready, and callers need
   * to reflect that without waiting for a full reload. */
  onTaskUpdated?: (task: Task) => void;
}

// file/dam_asset values aren't editable as plain text yet — render them read-only.
const EDITABLE_TYPES: PortValueType[] = ["string", "number", "boolean", "json"];

function stringifyValue(value: unknown, type: PortValueType): string {
  if (value === undefined || value === null) return "";
  if (type === "json") { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
  return String(value);
}

function parseValue(raw: string, type: PortValueType): unknown {
  if (raw.trim() === "") return null;
  switch (type) {
    case "number": { const n = Number(raw); return Number.isNaN(n) ? null : n; }
    case "boolean": return raw === "true";
    case "json": try { return JSON.parse(raw); } catch { return raw; }
    default: return raw;
  }
}

function DirectionSection({ taskId, token, direction, onTaskUpdated }: { taskId: string; token: string; direction: PortDirection; onTaskUpdated?: (task: Task) => void }) {
  const [specs, setSpecs] = useState<TaskPortSpec[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [secretSet, setSecretSet] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const load = direction === "input" ? getTaskInputs : getTaskOutputs;
    load(token, taskId)
      .then((res) => {
        setSpecs(res.specs);
        setValues(res.values ?? {});
        setSecretSet(res.secret_set);
        const nextDraft: Record<string, string> = {};
        res.specs.forEach((s) => { nextDraft[s.name] = stringifyValue((res.values ?? {})[s.name], s.value_type); });
        setDraft(nextDraft);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [token, taskId, direction]);

  const isDirty = specs.some((s) => draft[s.name] !== stringifyValue(values[s.name], s.value_type));

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const patch = direction === "input" ? patchTaskInputValues : patchTaskOutputValues;
      const nextValues: Record<string, unknown> = {};
      specs.forEach((s) => {
        if (!EDITABLE_TYPES.includes(s.value_type) || secretSet.includes(s.name)) return;
        nextValues[s.name] = parseValue(draft[s.name] ?? "", s.value_type);
      });
      const updatedTask = await patch(token, taskId, nextValues);
      setValues((prev) => ({ ...prev, ...nextValues }));
      onTaskUpdated?.(updatedTask);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const label = direction === "input" ? "Inputs" : "Outputs";

  if (loading) return <p className="text-xs text-slate-400">Loading {label.toLowerCase()}…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
        {isDirty && (
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="text-[10px] font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}
      {specs.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No {label.toLowerCase()} defined</p>
      ) : (
        <div className="space-y-2">
          {specs.map((s) => {
            const isSecret = secretSet.includes(s.name);
            const editable = EDITABLE_TYPES.includes(s.value_type) && !isSecret;
            return (
              <div key={s.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-700 truncate flex-1">{s.name}</span>
                  <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded shrink-0">{s.value_type}</span>
                  {s.required && <span className="text-[10px] text-amber-600 font-medium shrink-0">req</span>}
                </div>
                {isSecret ? (
                  <p className="text-xs text-slate-400 italic">Secret value set — not editable here</p>
                ) : !editable ? (
                  <p className="text-xs text-slate-400 italic">
                    {values[s.name] != null ? stringifyValue(values[s.name], s.value_type) : "—"} (read-only for {s.value_type})
                  </p>
                ) : s.value_type === "boolean" ? (
                  <select
                    value={draft[s.name] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [s.name]: e.target.value }))}
                    className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : s.value_type === "json" ? (
                  <textarea
                    value={draft[s.name] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [s.name]: e.target.value }))}
                    rows={3}
                    placeholder="null"
                    className="w-full text-xs font-mono border border-slate-300 rounded px-2 py-1.5 focus:border-violet-500 focus:outline-none resize-none"
                  />
                ) : (
                  <input
                    type={s.value_type === "number" ? "number" : "text"}
                    value={draft[s.name] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [s.name]: e.target.value }))}
                    placeholder="—"
                    className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-violet-500 focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PortValuesEditor({ taskId, token, onTaskUpdated }: Props) {
  return (
    <div className="space-y-4">
      <DirectionSection taskId={taskId} token={token} direction="input" onTaskUpdated={onTaskUpdated} />
      <DirectionSection taskId={taskId} token={token} direction="output" onTaskUpdated={onTaskUpdated} />
    </div>
  );
}
