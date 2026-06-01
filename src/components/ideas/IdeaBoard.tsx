"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { StickyNote, NoteLink, StickyColor, Port, Workflow } from "@/lib/types";
import {
  createSticky,
  updateSticky,
  deleteSticky,
  createNoteLink,
  updateNoteLink,
  deleteNoteLink,
} from "@/lib/notes-api";
import {
  createWorkflow,
  updateWorkflow,
  cloneWorkflowFromTemplate,
  createTask,
} from "@/lib/awe-api";
import { createNote } from "@/lib/notes-api";
import StickyCard from "./StickyCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import MarkdownEditor from "@/components/MarkdownEditor";

// ── Connector routing helpers ─────────────────────────────────────────────────

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

function buildConnector(
  from: StickyNote, to: StickyNote,
  bidir: boolean,
  fromPort?: Port | null,
  toPort?: Port | null,
) {
  let srcPort: Port, tgtPort: Port;

  if (fromPort && toPort) {
    srcPort = fromPort;
    tgtPort = toPort;
  } else if (!bidir) {
    srcPort = fromPort ?? bestPortTo(from, to.x + to.width / 2,   to.y + to.height / 2);
    tgtPort = toPort   ?? bestPortTo(to,   from.x + from.width / 2, from.y + from.height / 2);
  } else {
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
      srcPort = ROTATE_CW[primaryTgt];
      tgtPort = ROTATE_CW[primarySrc];
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
  projectId: string;
  backlogJobId: string | null;
  templates: Workflow[];
  initialStickies: StickyNote[];
  initialLinks: NoteLink[];
}

let nextOffset = 0;

function checkDamAccess(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if ((payload.roles ?? []).includes("admin")) return true;
    const active = (s: { status?: string } | undefined) =>
      s?.status === "active" || s?.status === "trialing";
    return active(payload.subscriptions?.comad) || active(payload.subscriptions?.clann);
  } catch { return false; }
}

export default function IdeaBoard({ boardId, token, projectId, backlogJobId, templates, initialStickies, initialLinks }: Props) {
  const [stickies, setStickies] = useState<StickyNote[]>(initialStickies);
  const [links, setLinks] = useState<NoteLink[]>(initialLinks);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [linkingFromPort, setLinkingFromPort] = useState<Port | null>(null);
  const [pendingLine, setPendingLine] = useState<{ x1: number; y1: number; x2: number; y2: number; port: Port } | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);
  const [labelModal, setLabelModal] = useState<LinkLabelModal | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [addingColor, setAddingColor] = useState<StickyColor>("yellow");
  const [createStoryStickyId, setCreateStoryStickyId] = useState<string | null>(null);
  const [pendingStoryUpdates, setPendingStoryUpdates] = useState<Set<string>>(new Set());

  // ── Zoom / pan ────────────────────────────────────────────────────────────

  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState({ x: 40, y: 40 });
  // Refs so event handlers always read the latest values without closure stale issues
  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);

  function setZoom(z: number) {
    zoomRef.current = z;
    setZoomState(z);
  }
  function setPan(p: { x: number; y: number }) {
    panRef.current = p;
    setPanState(p);
  }

  const canvasRef = useRef<HTMLDivElement>(null);
  const innerRef  = useRef<HTMLDivElement>(null);
  const panStart  = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Wheel: scroll → pan, ctrl/meta+scroll or pinch → zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        // deltaY is negative for zoom-in on pinch/ctrl+scroll
        const factor = Math.pow(0.999, e.deltaY);
        const newZoom = Math.min(3, Math.max(0.15, zoomRef.current * factor));
        const ratio = newZoom / zoomRef.current;
        const newPan = {
          x: mouseX - (mouseX - panRef.current.x) * ratio,
          y: mouseY - (mouseY - panRef.current.y) * ratio,
        };
        zoomRef.current = newZoom;
        panRef.current  = newPan;
        setZoomState(newZoom);
        setPanState(newPan);
      } else {
        const newPan = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        };
        panRef.current = newPan;
        setPanState(newPan);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom toward viewport center
  function applyZoom(newZ: number) {
    const z = Math.min(3, Math.max(0.15, newZ));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(z); return; }
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const ratio = z / zoomRef.current;
    setPan({
      x: cx - (cx - panRef.current.x) * ratio,
      y: cy - (cy - panRef.current.y) * ratio,
    });
    setZoom(z);
  }

  function fitToSize() {
    if (stickies.length === 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 60;
    const minX = Math.min(...stickies.map((s) => s.x));
    const minY = Math.min(...stickies.map((s) => s.y));
    const maxX = Math.max(...stickies.map((s) => s.x + s.width));
    const maxY = Math.max(...stickies.map((s) => s.y + s.height));
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const newZoom = Math.min(1, Math.min(rect.width / contentW, rect.height / contentH));
    // Center content: panX + (minX - padding) * zoom = (vw - contentW * zoom) / 2
    const newPan = {
      x: (rect.width  - contentW * newZoom) / 2 - (minX - padding) * newZoom,
      y: (rect.height - contentH * newZoom) / 2 - (minY - padding) * newZoom,
    };
    setZoom(newZoom);
    setPan(newPan);
  }

  // ── Canvas mouse tracking for in-progress link line ──────────────────────

  useEffect(() => {
    if (!linkingFrom) return;

    function onMove(e: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const src = stickies.find((s) => s.id === linkingFrom);
      if (!src) return;
      // Convert screen coords → canvas coords using live refs
      const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const mouseY = (e.clientY - rect.top  - panRef.current.y) / zoomRef.current;
      const port = linkingFromPort ?? bestPortTo(src, mouseX, mouseY);
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
  }, [linkingFrom, stickies, linkingFromPort]);

  // ── Sticky actions ────────────────────────────────────────────────────────

  async function handleAddSticky() {
    // Place new stickies at the current viewport center so they're always visible
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 };
    const cx = Math.round((rect.width  / 2 - panRef.current.x) / zoomRef.current);
    const cy = Math.round((rect.height / 2 - panRef.current.y) / zoomRef.current);
    const cascade = (nextOffset % 6) * 20;
    nextOffset++;
    const pos = { x: cx - 100 + cascade, y: cy - 60 + cascade };
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

  const stickiesRef = useRef(stickies);
  useEffect(() => { stickiesRef.current = stickies; }, [stickies]);

  const handleUpdate = useCallback(async (id: string, patch: { title?: string; body?: string; color?: StickyColor }) => {
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    await updateSticky(token, boardId, id, patch).catch(() => {});
    // If content (not just color) changed on a story-linked sticky, mark for update
    if (patch.title !== undefined || patch.body !== undefined) {
      const sticky = stickiesRef.current.find((s) => s.id === id);
      if (sticky?.workflow_id) {
        setPendingStoryUpdates((prev) => new Set([...prev, id]));
      }
    }
  }, [token, boardId]);

  async function handleDelete(id: string) {
    await deleteSticky(token, boardId, id);
    setStickies((prev) => prev.filter((s) => s.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_note_id !== id && l.to_note_id !== id));
    setConfirmDeleteId(null);
  }

  // ── Link actions ──────────────────────────────────────────────────────────

  const handleStartLink = useCallback((id: string, port?: Port) => {
    setLinkingFrom(id);
    setLinkingFromPort(port ?? null);
    setPendingLine(null);
  }, []);

  const handleFinishLink = useCallback(async (targetId: string, targetPort?: Port) => {
    if (!linkingFrom || linkingFrom === targetId) {
      setLinkingFrom(null);
      setLinkingFromPort(null);
      setPendingLine(null);
      return;
    }
    const link = await createNoteLink(
      token, boardId, linkingFrom, targetId,
      undefined, linkingFromPort ?? undefined, targetPort
    ).catch(() => null);
    if (link) setLinks((prev) => [...prev, link]);
    setLinkingFrom(null);
    setLinkingFromPort(null);
    setPendingLine(null);
  }, [linkingFrom, linkingFromPort, token, boardId]);

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

  async function handleStoryCreated(stickyId: string, workflowId: string) {
    await updateSticky(token, boardId, stickyId, { workflow_id: workflowId }).catch(() => {});
    setStickies((prev) => prev.map((s) => s.id === stickyId ? { ...s, workflow_id: workflowId } : s));
    setCreateStoryStickyId(null);
  }

  async function handleUpdateStory(stickyId: string) {
    const sticky = stickiesRef.current.find((s) => s.id === stickyId);
    if (!sticky?.workflow_id) return;
    const timestamp = new Date().toLocaleString(undefined, {
      dateStyle: "medium", timeStyle: "short",
    });
    await createNote(token, {
      entity_type: "workflow",
      entity_id: sticky.workflow_id,
      title: `${sticky.title} — ${timestamp}`,
      body: sticky.body ?? undefined,
      is_shared: true,
    }).catch(() => {});
    setPendingStoryUpdates((prev) => { const next = new Set(prev); next.delete(stickyId); return next; });
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

        {/* Inline color swatches */}
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

        {/* Zoom controls */}
        <div className="flex items-center gap-1 pl-3 border-l border-slate-200">
          <button
            type="button"
            onClick={() => applyZoom(zoom / 1.25)}
            title="Zoom out"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M6.5 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM0 6.5a6.5 6.5 0 1 1 11.743 3.829l3.464 3.464a.75.75 0 1 1-1.06 1.06l-3.464-3.464A6.5 6.5 0 0 1 0 6.5Zm3.25-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5Z"/>
            </svg>
          </button>
          <span className="text-xs text-slate-500 tabular-nums w-9 text-center select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoom(zoom * 1.25)}
            title="Zoom in"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M6.5 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM0 6.5a6.5 6.5 0 1 1 11.743 3.829l3.464 3.464a.75.75 0 1 1-1.06 1.06l-3.464-3.464A6.5 6.5 0 0 1 0 6.5Zm6.5-3.25a.75.75 0 0 1 .75.75V6h1.75a.75.75 0 0 1 0 1.5H7.25v1.75a.75.75 0 0 1-1.5 0V7.5H4a.75.75 0 0 1 0-1.5h1.75V4A.75.75 0 0 1 6.5 3.25Z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={fitToSize}
            title="Fit all to screen"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-600 transition-colors ml-0.5"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1.75 1h3.5a.75.75 0 0 1 0 1.5H2.5v2.75a.75.75 0 0 1-1.5 0v-3.5C1 1.336 1.336 1 1.75 1Zm9 0h3.5c.414 0 .75.336.75.75v3.5a.75.75 0 0 1-1.5 0V2.5h-2.75a.75.75 0 0 1 0-1.5ZM1 10.75a.75.75 0 0 1 1.5 0v2.75h2.75a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 1 15v-4.25Zm13.5 0v4.25a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1 0-1.5h2.75v-2.75a.75.75 0 0 1 1.5 0Z"/>
            </svg>
          </button>
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

      {/* Canvas viewport */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden select-none"
        style={{
          backgroundImage: `radial-gradient(circle, #94a3b8 1px, transparent 1px)`,
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          cursor: isPanning ? "grabbing" : undefined,
        }}
      >
        {/* Inner world canvas — transform applied here */}
        <div
          ref={innerRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "absolute",
            width: 10000,
            height: 8000,
            cursor: isPanning ? "grabbing" : "default",
          }}
          onPointerDown={(e) => {
            // Only act on clicks directly on the inner div (empty canvas), not on children
            if (e.target !== innerRef.current) return;
            if (linkingFrom) {
              setLinkingFrom(null);
              setPendingLine(null);
              return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            panStart.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
            setIsPanning(true);
          }}
          onPointerMove={(e) => {
            if (!panStart.current) return;
            const newPan = {
              x: panStart.current.ox + (e.clientX - panStart.current.px),
              y: panStart.current.oy + (e.clientY - panStart.current.py),
            };
            panRef.current = newPan;
            setPanState(newPan);
          }}
          onPointerUp={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
          onPointerCancel={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
        >
          {/* SVG layer for links */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            <defs>
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
              const bidir = !link.from_port && !link.to_port && links.some(
                (l) => l.from_note_id === link.to_note_id && l.to_note_id === link.from_note_id
                  && !l.from_port && !l.to_port
              );
              const { d, midX, midY, color } = buildConnector(
                fromSticky, toSticky, bidir, link.from_port, link.to_port
              );
              const hovered = hoveredLinkId === link.id;
              const labelW = link.label ? Math.max(link.label.length * 6.5 + 16, 44) : 0;
              return (
                <g
                  key={link.id}
                  style={{ pointerEvents: "all" }}
                  onMouseEnter={() => setHoveredLinkId(link.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                >
                  <path d={d} stroke="transparent" strokeWidth={18} fill="none" />
                  {hovered && (
                    <path d={d} stroke={color} strokeWidth={6} fill="none"
                      strokeLinecap="round" opacity={0.2}
                      filter="url(#connector-glow)" />
                  )}
                  <path
                    d={d}
                    stroke={color}
                    strokeWidth={hovered ? 3 : 2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={hovered ? 1 : 0.75}
                    markerEnd="url(#arrow)"
                  />
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
              zoom={zoom}
              hasDamAccess={checkDamAccess(token)}
              isLinking={!!linkingFrom}
              isLinkSource={linkingFrom === s.id}
              isLinkTarget={!!linkingFrom && linkingFrom !== s.id}
              projectId={projectId}
              storyHref={s.workflow_id ? `/projects/${projectId}/stories/${s.workflow_id}` : null}
              hasPendingStoryUpdate={pendingStoryUpdates.has(s.id)}
              onUpdateStory={handleUpdateStory}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onResizeMove={handleResizeMove}
              onResizeEnd={handleResizeEnd}
              onUpdate={handleUpdate}
              onDelete={(id) => setConfirmDeleteId(id)}
              onStartLink={handleStartLink}
              onFinishLink={handleFinishLink}
              onCreateStory={(id) => backlogJobId ? setCreateStoryStickyId(id) : undefined}
            />
          ))}
        </div>

        {stickies.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 select-none">
              <p className="text-sm font-medium mb-1">This board is empty</p>
              <p className="text-xs">Click <span className="font-semibold">Add idea</span> to start capturing ideas</p>
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

      {/* Create story from idea */}
      {createStoryStickyId && backlogJobId && (() => {
        const sticky = stickies.find((s) => s.id === createStoryStickyId);
        if (!sticky) return null;
        return (
          <CreateStoryFromIdeaModal
            sticky={sticky}
            jobId={backlogJobId}
            templates={templates}
            token={token}
            onCreated={(workflowId) => handleStoryCreated(createStoryStickyId, workflowId)}
            onClose={() => setCreateStoryStickyId(null)}
          />
        );
      })()}

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

// ── Create Story from Idea modal ──────────────────────────────────────────────

function CreateStoryFromIdeaModal({
  sticky,
  jobId,
  templates,
  token,
  onCreated,
  onClose,
}: {
  sticky: StickyNote;
  jobId: string;
  templates: Workflow[];
  token: string;
  onCreated: (workflowId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(sticky.title || "");
  const [description, setDescription] = useState("");
  const [noteBody, setNoteBody] = useState(sticky.body ?? "");
  const [points, setPoints] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Workflow | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const sortedTemplates = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  const filteredTemplates = sortedTemplates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const pts = points ? parseInt(points, 10) : undefined;
      let story: Workflow;

      if (selectedTemplate) {
        story = await cloneWorkflowFromTemplate(token, jobId, selectedTemplate.id);
        story = await updateWorkflow(token, story.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          story_points: pts,
          is_shared: true,
        });
      } else {
        story = await createWorkflow(token, {
          name: name.trim(),
          job_id: jobId,
          description: description.trim() || undefined,
          story_points: pts,
          is_shared: true,
        });
        await createTask(token, { name: "Define", workflow_id: story.id });
      }

      if (noteBody.trim()) {
        await createNote(token, {
          entity_type: "workflow",
          entity_id: story.id,
          title: name.trim(),
          body: noteBody.trim(),
          is_shared: true,
        });
      }

      onCreated(story.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-4">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Create story from idea</h2>
        <p className="text-sm text-slate-400 mb-5">
          The story will be added to the project backlog. A link back to this idea will appear on the sticky.
        </p>
        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Story name</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Notes <span className="text-slate-400 font-normal">(optional, Markdown)</span>
            </label>
            <MarkdownEditor value={noteBody} onChange={setNoteBody} placeholder="Idea content…" height={160} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Story points <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 w-28"
              placeholder="e.g. 3"
            />
          </div>
          {templates.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Workflow template <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div ref={dropdownRef} className="relative">
                <div className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 transition-colors ${dropdownOpen ? "border-violet-500 ring-1 ring-violet-500" : "border-slate-300"}`}>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
                    <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
                  </svg>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setSelectedTemplate(null); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search templates…"
                    className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
                  />
                  {selectedTemplate && (
                    <button type="button" onClick={() => { setSelectedTemplate(null); setSearch(""); setDropdownOpen(true); searchRef.current?.focus(); }}
                      className="text-slate-300 hover:text-slate-500 transition-colors shrink-0">
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2.22 2.22a.75.75 0 0 1 1.06 0L6 4.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L7.06 6l2.72 2.72a.75.75 0 1 1-1.06 1.06L6 7.06 3.28 9.78a.75.75 0 0 1-1.06-1.06L4.94 6 2.22 3.28a.75.75 0 0 1 0-1.06z"/>
                      </svg>
                    </button>
                  )}
                </div>
                {dropdownOpen && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {filteredTemplates.length === 0 ? (
                      <p className="text-sm text-slate-400 px-4 py-3">No matches.</p>
                    ) : (
                      filteredTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setSelectedTemplate(t); setSearch(t.name); setDropdownOpen(false); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-violet-50 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <p className="text-sm font-medium text-slate-800">{t.name}</p>
                          {t.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedTemplate?.description && (
                <div className="mt-1 bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500">{selectedTemplate.description}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {submitting ? "Creating…" : "Create story"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
