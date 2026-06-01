"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { StickyNote, NoteLink, StickyColor } from "@/lib/types";
import {
  createSticky,
  updateSticky,
  deleteSticky,
  createNoteLink,
  updateNoteLink,
  deleteNoteLink,
} from "@/lib/notes-api";
import StickyCard, { STICKY_COLORS } from "./StickyCard";
import ConfirmDialog from "@/components/ConfirmDialog";

interface LinkLabelModal {
  linkId: string;
  currentLabel: string | null;
}

interface Props {
  boardId: string;
  token: string;
  initialStickies: StickyNote[];
  initialLinks: NoteLink[];
}

// Offset so new stickies don't all pile up at 0,0
let nextOffset = 0;
function nextDropPos() {
  const p = 40 + (nextOffset % 10) * 24;
  nextOffset++;
  return { x: p, y: p };
}

export default function IdeaBoard({ boardId, token, initialStickies, initialLinks }: Props) {
  const [stickies, setStickies] = useState<StickyNote[]>(initialStickies);
  const [links, setLinks] = useState<NoteLink[]>(initialLinks);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [pendingLine, setPendingLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);
  const [labelModal, setLabelModal] = useState<LinkLabelModal | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [addingColor, setAddingColor] = useState<StickyColor>("yellow");
  const [showColorMenu, setShowColorMenu] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Canvas mouse tracking for in-progress link line ──────────────────────

  useEffect(() => {
    if (!linkingFrom) return;

    function onMove(e: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const src = stickies.find((s) => s.id === linkingFrom);
      if (!src) return;
      setPendingLine({
        x1: src.x + src.width / 2,
        y1: src.y + src.height / 2,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setLinkingFrom(null); setPendingLine(null); }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [linkingFrom, stickies]);

  // ── Sticky actions ────────────────────────────────────────────────────────

  async function handleAddSticky() {
    const pos = nextDropPos();
    const s = await createSticky(token, boardId, { title: "New idea", color: addingColor, ...pos });
    setStickies((prev) => [...prev, s]);
  }

  const handleDragEnd = useCallback(async (id: string, x: number, y: number) => {
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
    await updateSticky(token, boardId, id, { x, y }).catch(() => {});
  }, [token, boardId]);

  const handleUpdate = useCallback(async (id: string, patch: { title?: string; body?: string; color?: StickyColor }) => {
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    await updateSticky(token, boardId, id, patch).catch(() => {});
  }, [token, boardId]);

  async function handleDelete(id: string) {
    await deleteSticky(token, boardId, id);
    setStickies((prev) => prev.filter((s) => s.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_note_id !== id && l.to_note_id !== id));
    setConfirmDeleteId(null);
  }

  // ── Link actions ──────────────────────────────────────────────────────────

  const handleStartLink = useCallback((id: string) => {
    setLinkingFrom(id);
    setPendingLine(null);
  }, []);

  const handleFinishLink = useCallback(async (targetId: string) => {
    if (!linkingFrom || linkingFrom === targetId) {
      setLinkingFrom(null);
      setPendingLine(null);
      return;
    }
    const link = await createNoteLink(token, boardId, linkingFrom, targetId).catch(() => null);
    if (link) setLinks((prev) => [...prev, link]);
    setLinkingFrom(null);
    setPendingLine(null);
  }, [linkingFrom, token, boardId]);

  async function handleDeleteLink(id: string) {
    await deleteNoteLink(token, id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setConfirmDeleteLinkId(null);
  }

  async function handleSaveLabel() {
    if (!labelModal) return;
    const updated = await updateNoteLink(token, labelModal.linkId, labelDraft.trim() || null);
    setLinks((prev) => prev.map((l) => l.id === updated.id ? updated : l));
    setLabelModal(null);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function stickyCenter(id: string) {
    const s = stickies.find((s) => s.id === id);
    return s ? { x: s.x + s.width / 2, y: s.y + s.height / 2 } : { x: 0, y: 0 };
  }

  function arrowPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Shorten line to avoid overlap with card edge
    const offset = 12;
    const ex = x2 - (dx / len) * offset;
    const ey = y2 - (dy / len) * offset;
    return `M${x1},${y1} L${ex},${ey}`;
  }

  const canvasColor = "rgba(148,163,184,0.06)"; // very subtle dot grid via CSS

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="relative">
          <button
            type="button"
            onClick={handleAddSticky}
            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/>
            </svg>
            Add sticky
          </button>
          <button
            type="button"
            onClick={() => setShowColorMenu((v) => !v)}
            className="inline-flex items-center justify-center w-6 h-[30px] -ml-px rounded-r-lg border-l border-violet-500 bg-violet-600 hover:bg-violet-700 transition-colors"
            title="Pick color for new stickies"
          >
            <span className={`w-3 h-3 rounded-full border border-white/40 ${
              addingColor === "yellow" ? "bg-yellow-400" :
              addingColor === "pink"   ? "bg-pink-400" :
              addingColor === "blue"   ? "bg-blue-400" :
              addingColor === "green"  ? "bg-emerald-400" :
              addingColor === "purple" ? "bg-violet-300" :
              "bg-orange-400"
            }`} />
          </button>
          {showColorMenu && (
            <div className="absolute left-0 top-full mt-1 flex gap-1.5 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
              {(["yellow","pink","blue","green","purple","orange"] as StickyColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setAddingColor(c); setShowColorMenu(false); }}
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    c === "yellow" ? "bg-yellow-400" : c === "pink" ? "bg-pink-400" :
                    c === "blue" ? "bg-blue-400" : c === "green" ? "bg-emerald-400" :
                    c === "purple" ? "bg-violet-400" : "bg-orange-400"
                  } ${c === addingColor ? "border-slate-700" : "border-transparent"}`}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        {linkingFrom && (
          <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 animate-pulse">
              <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
            </svg>
            Click another sticky to link — <kbd className="font-mono bg-violet-100 px-1 rounded">Esc</kbd> to cancel
          </div>
        )}

        <span className="ml-auto text-xs text-slate-400">{stickies.length} {stickies.length === 1 ? "idea" : "ideas"}</span>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-auto"
        style={{
          backgroundImage: `radial-gradient(circle, #94a3b8 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}
        onPointerDown={(e) => {
          if (e.target === canvasRef.current) {
            setLinkingFrom(null);
            setPendingLine(null);
            setShowColorMenu(false);
          }
        }}
      >
        {/* SVG layer for links */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
            </marker>
            <marker id="arrowhead-hover" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#7c3aed" />
            </marker>
          </defs>

          {links.map((link) => {
            const from = stickyCenter(link.from_note_id);
            const to   = stickyCenter(link.to_note_id);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const d    = arrowPath(from.x, from.y, to.x, to.y);
            return (
              <g key={link.id} className="group" style={{ pointerEvents: "all" }}>
                {/* Invisible wide hit area */}
                <path d={d} stroke="transparent" strokeWidth={16} fill="none" />
                <path
                  d={d}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  fill="none"
                  markerEnd="url(#arrowhead)"
                  className="group-hover:stroke-violet-500 transition-colors"
                />
                {link.label && (
                  <text
                    x={midX}
                    y={midY - 4}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-500 select-none group-hover:fill-violet-600"
                    style={{ fontSize: 10, userSelect: "none" }}
                  >
                    {link.label}
                  </text>
                )}
                {/* Delete / label buttons on hover */}
                <g
                  transform={`translate(${midX}, ${midY})`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <rect x={-22} y={4} width={44} height={16} rx={4} fill="white" stroke="#e2e8f0" strokeWidth={1} />
                  <text
                    x={-8} y={15}
                    textAnchor="middle"
                    style={{ fontSize: 10, cursor: "pointer", userSelect: "none" }}
                    fill="#6b7280"
                    onClick={() => { setLabelDraft(link.label ?? ""); setLabelModal({ linkId: link.id, currentLabel: link.label }); }}
                  >
                    ✏︎
                  </text>
                  <text
                    x={10} y={15}
                    textAnchor="middle"
                    style={{ fontSize: 10, cursor: "pointer", userSelect: "none" }}
                    fill="#ef4444"
                    onClick={() => setConfirmDeleteLinkId(link.id)}
                  >
                    ✕
                  </text>
                </g>
              </g>
            );
          })}

          {/* In-progress link */}
          {pendingLine && (
            <path
              d={`M${pendingLine.x1},${pendingLine.y1} L${pendingLine.x2},${pendingLine.y2}`}
              stroke="#7c3aed"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              fill="none"
              markerEnd="url(#arrowhead-hover)"
            />
          )}
        </svg>

        {/* Sticky cards */}
        {stickies.map((s) => (
          <StickyCard
            key={s.id}
            sticky={s}
            isLinking={!!linkingFrom}
            isLinkSource={linkingFrom === s.id}
            isLinkTarget={!!linkingFrom && linkingFrom !== s.id}
            onDragEnd={handleDragEnd}
            onUpdate={handleUpdate}
            onDelete={(id) => setConfirmDeleteId(id)}
            onStartLink={handleStartLink}
            onFinishLink={handleFinishLink}
          />
        ))}

        {stickies.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 select-none">
              <p className="text-sm font-medium mb-1">This board is empty</p>
              <p className="text-xs">Click <span className="font-semibold">Add sticky</span> to start capturing ideas</p>
            </div>
          </div>
        )}
      </div>

      {/* Confirm delete sticky */}
      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete sticky?"
          message="This will permanently delete this idea and any links attached to it."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* Confirm delete link */}
      {confirmDeleteLinkId && (
        <ConfirmDialog
          title="Remove link?"
          message="This will remove the connector between these two stickies."
          confirmLabel="Remove"
          onConfirm={() => handleDeleteLink(confirmDeleteLinkId)}
          onCancel={() => setConfirmDeleteLinkId(null)}
        />
      )}

      {/* Edit link label */}
      {labelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Link label</h3>
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setLabelModal(null); }}
              placeholder="e.g. leads to, blocks, relates to…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <div className="flex gap-2 justify-end mt-3">
              <button type="button" onClick={() => setLabelModal(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
              <button type="button" onClick={handleSaveLabel} className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
