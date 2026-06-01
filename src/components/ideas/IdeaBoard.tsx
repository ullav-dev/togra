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
import StickyCard from "./StickyCard";
import ConfirmDialog from "@/components/ConfirmDialog";

// ── Connector routing helpers ─────────────────────────────────────────────────

type Port = "top" | "right" | "bottom" | "left";

const CONNECTOR_COLORS: Record<StickyColor, string> = {
  yellow: "#d97706",
  pink:   "#db2777",
  blue:   "#2563eb",
  green:  "#059669",
  purple: "#7c3aed",
  orange: "#ea580c",
};

function portPos(s: StickyNote, port: Port) {
  switch (port) {
    case "top":    return { x: s.x + s.width / 2,  y: s.y };
    case "bottom": return { x: s.x + s.width / 2,  y: s.y + s.height };
    case "left":   return { x: s.x,                 y: s.y + s.height / 2 };
    case "right":  return { x: s.x + s.width,       y: s.y + s.height / 2 };
  }
}

function bestPortTo(from: StickyNote, toX: number, toY: number): Port {
  const dx = toX - (from.x + from.width / 2);
  const dy = toY - (from.y + from.height / 2);
  const a = Math.atan2(dy, dx) * (180 / Math.PI);
  if (a > -45 && a <= 45)   return "right";
  if (a > 45  && a <= 135)  return "bottom";
  if (a > 135 || a <= -135) return "left";
  return "top";
}

function cpOffset(port: Port, dist: number): { dx: number; dy: number } {
  const d = Math.min(Math.max(dist * 0.45, 60), 180);
  switch (port) {
    case "top":    return { dx: 0,  dy: -d };
    case "bottom": return { dx: 0,  dy:  d };
    case "left":   return { dx: -d, dy:  0 };
    case "right":  return { dx:  d, dy:  0 };
  }
}

// Rotate a port 90° clockwise: right→bottom→left→top→right
const ROTATE_CW: Record<Port, Port> = {
  right: "bottom", bottom: "left", left: "top", top: "right",
};

function buildConnector(from: StickyNote, to: StickyNote, bidir: boolean) {
  let srcPort: Port, tgtPort: Port;

  if (!bidir) {
    srcPort = bestPortTo(from, to.x + to.width / 2,   to.y + to.height / 2);
    tgtPort = bestPortTo(to,   from.x + from.width / 2, from.y + from.height / 2);
  } else {
    // Primary link (lower-ID → higher-ID): natural port routing.
    // Return link (higher-ID → lower-ID): rotate both ports 90° CW so it
    // departs and arrives on orthogonal sides, giving a clearly separate arc.
    const primarySrc = bestPortTo(from.id < to.id ? from : to,
      (from.id < to.id ? to : from).x + (from.id < to.id ? to : from).width / 2,
      (from.id < to.id ? to : from).y + (from.id < to.id ? to : from).height / 2);
    const primaryTgt = bestPortTo(from.id < to.id ? to : from,
      (from.id < to.id ? from : to).x + (from.id < to.id ? from : to).width / 2,
      (from.id < to.id ? from : to).y + (from.id < to.id ? from : to).height / 2);

    if (from.id < to.id) {
      srcPort = primarySrc;
      tgtPort = primaryTgt;
    } else {
      // Return: rotate the primary ports CW so this link uses orthogonal sides
      srcPort = ROTATE_CW[primaryTgt]; // depart from B on a rotated side
      tgtPort = ROTATE_CW[primarySrc]; // arrive at A on a rotated side
    }
  }

  const src  = portPos(from, srcPort);
  const tgt  = portPos(to,   tgtPort);
  const dist = Math.hypot(tgt.x - src.x, tgt.y - src.y);
  const c1   = cpOffset(srcPort, dist);
  const c2   = cpOffset(tgtPort, dist);
  const p1x = src.x + c1.dx, p1y = src.y + c1.dy;
  const p2x = tgt.x + c2.dx, p2y = tgt.y + c2.dy;

  const midX = 0.125*src.x + 0.375*p1x + 0.375*p2x + 0.125*tgt.x;
  const midY = 0.125*src.y + 0.375*p1y + 0.375*p2y + 0.125*tgt.y;
  return {
    d: `M ${src.x} ${src.y} C ${p1x} ${p1y} ${p2x} ${p2y} ${tgt.x} ${tgt.y}`,
    midX, midY,
    color: CONNECTOR_COLORS[from.color] ?? "#7c3aed",
  };
}

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
  const [pendingLine, setPendingLine] = useState<{ x1: number; y1: number; x2: number; y2: number; port: Port } | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);
  const [labelModal, setLabelModal] = useState<LinkLabelModal | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [addingColor, setAddingColor] = useState<StickyColor>("yellow");
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
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const port = bestPortTo(src, mouseX, mouseY);
      const pp = portPos(src, port);
      setPendingLine({ x1: pp.x, y1: pp.y, x2: mouseX, y2: mouseY, port });
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

  const dragRafRef = useRef<number | null>(null);

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
    dragRafRef.current = requestAnimationFrame(() => {
      setStickies((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
      dragRafRef.current = null;
    });
  }, []);

  const handleDragEnd = useCallback(async (id: string, x: number, y: number) => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
    await updateSticky(token, boardId, id, { x, y }).catch(() => {});
  }, [token, boardId]);

  const resizeRafRef = useRef<number | null>(null);

  const handleResizeMove = useCallback((id: string, width: number, height: number) => {
    if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
    resizeRafRef.current = requestAnimationFrame(() => {
      setStickies((prev) => prev.map((s) => s.id === id ? { ...s, width, height } : s));
      resizeRafRef.current = null;
    });
  }, []);

  const handleResizeEnd = useCallback(async (id: string, width: number, height: number) => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, width, height } : s));
    await updateSticky(token, boardId, id, { width, height }).catch(() => {});
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


  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 shrink-0 z-10">
        <button
          type="button"
          onClick={handleAddSticky}
          className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1Z"/>
          </svg>
          Add idea
        </button>

        {/* Inline color swatches — no dropdown */}
        <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
          {(["yellow","pink","blue","green","purple","orange"] as StickyColor[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAddingColor(c)}
              title={c}
              className={`w-4 h-4 rounded-full transition-all hover:scale-110 ${
                c === "yellow" ? "bg-yellow-400" : c === "pink" ? "bg-pink-400" :
                c === "blue" ? "bg-blue-400" : c === "green" ? "bg-emerald-400" :
                c === "purple" ? "bg-violet-400" : "bg-orange-400"
              } ${c === addingColor ? "ring-2 ring-offset-1 ring-slate-500 scale-110" : ""}`}
            />
          ))}
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
          }
        }}
      >
        {/* SVG layer for links */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
        >
          <defs>
            {/* Single arrowhead — inherits stroke color via context-stroke */}
            <marker id="arrow" markerWidth="4" markerHeight="3" refX="3.5" refY="1.5"
              orient="auto" markerUnits="strokeWidth">
              <polygon points="0,0 4,1.5 0,3" fill="context-stroke" />
            </marker>
            <marker id="arrow-pending" markerWidth="4" markerHeight="3" refX="3.5" refY="1.5"
              orient="auto" markerUnits="strokeWidth">
              <polygon points="0,0 4,1.5 0,3" fill="#7c3aed" />
            </marker>
            <filter id="connector-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {links.map((link) => {
            const fromSticky = stickies.find((s) => s.id === link.from_note_id);
            const toSticky   = stickies.find((s) => s.id === link.to_note_id);
            if (!fromSticky || !toSticky) return null;
            const bidir = links.some(
              (l) => l.from_note_id === link.to_note_id && l.to_note_id === link.from_note_id
            );
            const { d, midX, midY, color } = buildConnector(fromSticky, toSticky, bidir);
            const hovered = hoveredLinkId === link.id;
            const labelW = link.label ? Math.max(link.label.length * 6.5 + 16, 44) : 0;
            return (
              <g
                key={link.id}
                style={{ pointerEvents: "all" }}
                onMouseEnter={() => setHoveredLinkId(link.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
              >
                {/* Wide invisible hit area */}
                <path d={d} stroke="transparent" strokeWidth={18} fill="none" />
                {/* Glow on hover */}
                {hovered && (
                  <path d={d} stroke={color} strokeWidth={6} fill="none"
                    strokeLinecap="round" opacity={0.2}
                    filter="url(#connector-glow)" />
                )}
                {/* Main connector */}
                <path
                  d={d}
                  stroke={hovered ? color : color}
                  strokeWidth={hovered ? 3 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={hovered ? 1 : 0.75}
                  markerEnd="url(#arrow)"
                />
                {/* Label pill */}
                {link.label && (
                  <g transform={`translate(${midX - labelW / 2}, ${midY - 11})`}>
                    <rect width={labelW} height={20} rx={10} fill="white"
                      stroke={color} strokeWidth={1.5} />
                    <text x={labelW / 2} y={14} textAnchor="middle"
                      style={{ fontSize: 10.5, fontWeight: 600, userSelect: "none", fill: color }}>
                      {link.label}
                    </text>
                  </g>
                )}
                {/* Edit / delete controls — appear on hover */}
                {hovered && (
                  <g transform={`translate(${midX}, ${midY + (link.label ? 18 : 0)})`}
                    style={{ pointerEvents: "all" }}>
                    <rect x={-24} y={4} width={48} height={20} rx={6}
                      fill="white" stroke={color} strokeWidth={1.5} />
                    <text x={-10} y={17} textAnchor="middle"
                      style={{ fontSize: 11, cursor: "pointer", userSelect: "none" }}
                      fill="#6b7280"
                      onClick={() => { setLabelDraft(link.label ?? ""); setLabelModal({ linkId: link.id, currentLabel: link.label }); }}>
                      ✏︎
                    </text>
                    <line x1={2} y1={6} x2={2} y2={18} stroke="#e2e8f0" strokeWidth={1} />
                    <text x={14} y={17} textAnchor="middle"
                      style={{ fontSize: 11, cursor: "pointer", userSelect: "none" }}
                      fill="#ef4444"
                      onClick={() => setConfirmDeleteLinkId(link.id)}>
                      ✕
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* In-progress link — bezier from departure port */}
          {pendingLine && (() => {
            const dist = Math.hypot(pendingLine.x2 - pendingLine.x1, pendingLine.y2 - pendingLine.y1);
            const cp = cpOffset(pendingLine.port, dist);
            const pendingD = `M ${pendingLine.x1} ${pendingLine.y1} C ${pendingLine.x1 + cp.dx} ${pendingLine.y1 + cp.dy} ${pendingLine.x2} ${pendingLine.y2} ${pendingLine.x2} ${pendingLine.y2}`;
            return (
              <path
                d={pendingD}
                stroke="#7c3aed"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="7 4"
                fill="none"
                opacity={0.7}
                markerEnd="url(#arrow-pending)"
              />
            );
          })()}
        </svg>

        {/* Sticky cards */}
        {stickies.map((s) => (
          <StickyCard
            key={s.id}
            sticky={s}
            token={token}
            isLinking={!!linkingFrom}
            isLinkSource={linkingFrom === s.id}
            isLinkTarget={!!linkingFrom && linkingFrom !== s.id}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onResizeMove={handleResizeMove}
            onResizeEnd={handleResizeEnd}
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
