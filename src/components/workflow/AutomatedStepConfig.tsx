"use client";

import { useEffect, useState } from "react";
import { getTaskScript, upsertTaskScript, deleteTaskScript, listExecutionProfiles } from "@/lib/awe-api";
import type { TaskScript, ExecutionProfile, ScriptType } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

const SCRIPT_TYPES: { value: ScriptType; label: string; description: string }[] = [
  { value: "webhook",  label: "Webhook",   description: "POST to an HTTP endpoint" },
  { value: "shell",    label: "Shell",     description: "Bash script executed on the runner" },
  { value: "python",   label: "Python",    description: "Python script executed on the runner" },
  { value: "mcp_tool", label: "MCP Tool",  description: "Model-context-protocol tool invocation" },
];

const NEEDS_BODY: ScriptType[] = ["shell", "python", "mcp_tool"];

interface Props {
  taskId: string;
  token: string;
}

export default function AutomatedStepConfig({ taskId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState<TaskScript | null>(null);
  const [profiles, setProfiles] = useState<ExecutionProfile[]>([]);

  // Draft state
  const [scriptType, setScriptType] = useState<ScriptType>("webhook");
  const [endpoint, setEndpoint] = useState("");
  const [scriptBody, setScriptBody] = useState("");
  const [timeoutSecs, setTimeoutSecs] = useState(30);
  const [retryLimit, setRetryLimit] = useState(0);
  const [profileId, setProfileId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getTaskScript(token, taskId).catch(() => null),
      listExecutionProfiles(token).catch(() => [] as ExecutionProfile[]),
    ]).then(([sc, profs]) => {
      setProfiles(profs);
      if (sc) {
        setScript(sc);
        setScriptType(sc.script_type);
        setEndpoint(sc.endpoint ?? "");
        setScriptBody(sc.script_body ?? "");
        setTimeoutSecs(sc.timeout_secs);
        setRetryLimit(sc.retry_limit);
        setProfileId(sc.execution_profile_id ?? "");
      } else {
        setScript(null);
      }
    }).finally(() => setLoading(false));
  }, [taskId, token]);

  const needsBody = NEEDS_BODY.includes(scriptType);
  const needsProfile = scriptType === "shell" || scriptType === "python";

  const isDirty = !script
    ? true  // always dirty when no script exists yet
    : scriptType !== script.script_type ||
      endpoint !== (script.endpoint ?? "") ||
      scriptBody !== (script.script_body ?? "") ||
      timeoutSecs !== script.timeout_secs ||
      retryLimit !== script.retry_limit ||
      profileId !== (script.execution_profile_id ?? "");

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await upsertTaskScript(token, taskId, {
        script_type: scriptType,
        endpoint: scriptType === "webhook" ? endpoint.trim() || null : null,
        script_body: needsBody ? scriptBody || null : null,
        timeout_secs: timeoutSecs,
        retry_limit: retryLimit,
        execution_profile_id: needsProfile && profileId ? profileId : null,
      });
      setScript(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save script");
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    setConfirmRemove(false);
    try {
      await deleteTaskScript(token, taskId);
      setScript(null);
      setScriptType("webhook");
      setEndpoint(""); setScriptBody("");
      setTimeoutSecs(30); setRetryLimit(0); setProfileId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove script");
    } finally { setSaving(false); }
  }

  const labelCls = "block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1";
  const inputCls = "w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white disabled:opacity-50";

  if (loading) return <p className="text-xs text-slate-400 py-2">Loading script…</p>;

  return (
    <>
      {confirmRemove && (
        <ConfirmDialog
          title="Remove script?"
          message="The script configuration for this step will be permanently deleted."
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => void handleRemove()}
          onCancel={() => setConfirmRemove(false)}
        />
      )}

      <div className="space-y-4">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Script type */}
        <div>
          <label className={labelCls}>Script type</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SCRIPT_TYPES.map((st) => (
              <button key={st.value} type="button" onClick={() => setScriptType(st.value)} disabled={saving}
                className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors disabled:opacity-50 ${
                  scriptType === st.value
                    ? "bg-violet-50 border-violet-400 text-violet-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}>
                <p className="font-medium">{st.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{st.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint (webhook) */}
        {scriptType === "webhook" && (
          <div>
            <label className={labelCls}>Endpoint URL</label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={saving}
              placeholder="https://api.example.com/hook"
              className={inputCls}
            />
          </div>
        )}

        {/* Script body (shell / python / mcp_tool) */}
        {needsBody && (
          <div>
            <label className={labelCls}>
              {scriptType === "shell" ? "Shell script" : scriptType === "python" ? "Python script" : "MCP tool config"}
            </label>
            <textarea
              value={scriptBody}
              onChange={(e) => setScriptBody(e.target.value)}
              disabled={saving}
              rows={8}
              spellCheck={false}
              placeholder={
                scriptType === "shell" ? "#!/bin/bash\n# …" :
                scriptType === "python" ? "# Python 3\n# …" :
                "# MCP tool invocation\n# …"
              }
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-slate-950 text-slate-100 resize-y disabled:opacity-50 placeholder:text-slate-600"
            />
          </div>
        )}

        {/* Execution profile (shell / python) */}
        {needsProfile && (
          <div>
            <label className={labelCls}>Execution profile</label>
            {profiles.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No execution profiles configured. Runs locally on the runner host.</p>
            ) : (
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={saving} className={inputCls}>
                <option value="">Run locally (no profile)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.image}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Timeout + retry */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Timeout (sec)</label>
            <input type="number" min={1} max={86400} value={timeoutSecs}
              onChange={(e) => setTimeoutSecs(Number(e.target.value))}
              disabled={saving} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Retry limit</label>
            <input type="number" min={0} max={10} value={retryLimit}
              onChange={(e) => setRetryLimit(Number(e.target.value))}
              disabled={saving} className={inputCls} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          {script ? (
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={saving}
              className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40 transition-colors">
              Remove script
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
            <button type="button" onClick={() => void handleSave()} disabled={saving || !isDirty}
              className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40">
              {saving ? "Saving…" : script ? "Save script" : "Attach script"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
