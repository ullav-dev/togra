"use client";

import { useMemo, useState } from "react";
import AiChat from "./AiChat";
import MarkdownEditor from "@/components/MarkdownEditor";
import { createTackNotesApi } from "@ullav-dev/tack-notes";
import type { NoteEntityType } from "@/lib/types";

// Matches NotesPanel.tsx's OWNING_SERVICE -- the Phase 2 backfill's
// content_attachments scope for every togra note. A "save as note" here
// must land in the same place NotesPanel reads from, or the saved research
// note is invisible from the entity's own Notes tab.
const OWNING_SERVICE = "awe";

// ── Tab definition — add future explorers here ────────────────────────────────

type TabId = "ai";

const TABS: { id: TabId; label: string }[] = [
  { id: "ai", label: "AI Research" },
];

// ── Save-as-note form ─────────────────────────────────────────────────────────

interface SaveNoteFormProps {
  token: string;
  entityType: NoteEntityType;
  entityId: string;
  /** The entity's own team -- required for tack-server's create_note.
   *  `null` disables saving (see the disabled-state note below). */
  teamId: string | null;
  initialBody: string;
  onDone: () => void;
  onCancel: () => void;
}

function SaveNoteForm({ token, entityType, entityId, teamId, initialBody, onDone, onCancel }: SaveNoteFormProps) {
  const [title, setTitle] = useState(() => `AI Research — ${new Date().toLocaleDateString()}`);
  const [body, setBody] = useState(initialBody);
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => createTackNotesApi("/api/tack", token), [token]);

  async function handleSave() {
    if (!title.trim()) return;
    if (!teamId) { setError("This entity has no team -- can't save a note."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createNote({
        team_id: teamId,
        visibility: isShared ? "team" : "private",
        title: title.trim(),
        body_markdown: body,
        attach: { owning_service: OWNING_SERVICE, entity_type: entityType, entity_id: entityId },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-violet-50 border-t border-violet-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-700">Save as note</span>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-48">
        <MarkdownEditor value={body} onChange={setBody} height={120} />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            type="button"
            role="switch"
            aria-checked={isShared}
            onClick={() => setIsShared((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              isShared ? "bg-violet-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                isShared ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-slate-600">{isShared ? "Shared" : "Private"}</span>
        </label>

        {error && <span className="text-xs text-red-600">{error}</span>}

        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !teamId}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}

// ── Research Panel ────────────────────────────────────────────────────────────

export interface ResearchPanelProps {
  token: string;
  entityType: NoteEntityType;
  entityId: string;
  /** The entity's own team -- required to save AI research as a note (see
   *  SaveNoteForm). `null` if not yet resolved or the entity has no team;
   *  "Save as note" is disabled in that case rather than failing silently. */
  teamId: string | null;
  storyId?: string;
  storyTitle?: string;
  taskId?: string;
  taskTitle?: string;
  storyDescription?: string;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export default function ResearchPanel({
  token,
  entityType,
  entityId,
  teamId,
  storyId,
  storyTitle,
  taskId,
  taskTitle,
  storyDescription,
  onClose,
  onOpenSettings,
}: ResearchPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const [pendingNoteBody, setPendingNoteBody] = useState<string | null>(null);

  function handleSaveAsNote(body: string) {
    setPendingNoteBody(body);
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      {/* Panel header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-violet-600">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-semibold text-white">Research</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-violet-200 hover:text-white hover:bg-violet-700 transition-colors"
          aria-label="Close research panel"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      {TABS.length > 1 && (
        <div className="shrink-0 flex border-b border-slate-200 bg-slate-50">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "ai" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <AiChat
                token={token}
                storyId={storyId}
                taskId={taskId}
                storyTitle={storyTitle}
                taskTitle={taskTitle}
                storyDescription={storyDescription}
                onSaveAsNote={handleSaveAsNote}
                onOpenSettings={onOpenSettings}
              />
            </div>

            {pendingNoteBody !== null && (
              <SaveNoteForm
                token={token}
                entityType={entityType}
                entityId={entityId}
                teamId={teamId}
                initialBody={pendingNoteBody}
                onDone={() => setPendingNoteBody(null)}
                onCancel={() => setPendingNoteBody(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
