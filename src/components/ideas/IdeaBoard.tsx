"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Dagre from "@dagrejs/dagre";
import type { StickyNote, NoteLink, StickyColor, Port, Workflow, TeamMember } from "@/lib/types";
import type { BoardShape, ShapeType, ShapePort } from "@ullav-dev/diagram-shapes";
import { ShapeNode, ShapeIcon, SHAPE_LABELS, DEFAULT_SHAPE_SIZES, shapePortPos, bestShapePortTo } from "@ullav-dev/diagram-shapes";
import type { PickedAsset } from "@ullav-dev/dam-picker";
import DamPickerModal from "./DamPickerModal";
import {
  createSticky,
  updateSticky,
  deleteSticky,
  createBoardLink,
  updateNoteLink,
  deleteNoteLink,
  listStickies,
  listNoteLinks,
  listShapes,
  createShape,
  updateShape,
  deleteShape,
} from "@/lib/notes-api";
import RefreshControl, { DEFAULT_REFRESH_INTERVALS } from "@/components/RefreshControl";

const IDEAS_REFRESH_INTERVALS = [...DEFAULT_REFRESH_INTERVALS, { label: "10 sec", secs: 10 }]
  .sort((a, b) => a.secs - b.secs);
import {
  createWorkflow,
  updateWorkflow,
  cloneWorkflowFromTemplate,
  createTask,
} from "@/lib/awe-api";
import { createTackNotesApi } from "@ullav-dev/tack-notes";
import StickyCard from "./StickyCard";

// Matches NotesPanel.tsx's OWNING_SERVICE -- the Phase 2 backfill's
// content_attachments scope for every togra note. A note this board writes
// onto a workflow must land in the same place NotesPanel reads from.
const OWNING_SERVICE = "awe";
import ShapePropsPanel from "./ShapePropsPanel";
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

function bestPortFromSticky(s: StickyNote, link: NoteLink): Port {
  // fallback port direction when no explicit port is stored
  return s.id === link.from_note_id ? "right" : "left";
}

// ── Auto Layout ───────────────────────────────────────────────────────────────
// Runs Dagre (left-to-right) per connected component of the sticky/shape graph,
// then tiles the components in rows so unconnected clusters never overlap.

const AUTO_LAYOUT_MAX_ROW_WIDTH = 2400;
const AUTO_LAYOUT_COMPONENT_GAP = 80;

interface LayoutNode {
  key: string; // "sticky:<id>" or "shape:<id>"
  id: string;
  kind: "sticky" | "shape";
  width: number;
  height: number;
}

function autoLayoutBoard(
  stickies: StickyNote[],
  shapes: BoardShape[],
  links: NoteLink[],
): { stickyPositions: Map<string, { x: number; y: number }>; shapePositions: Map<string, { x: number; y: number }> } {
  const nodes: LayoutNode[] = [
    ...stickies.map((s) => ({ key: `sticky:${s.id}`, id: s.id, kind: "sticky" as const, width: s.width, height: s.height })),
    ...shapes.map((s) => ({ key: `shape:${s.id}`, id: s.id, kind: "shape" as const, width: s.width, height: s.height })),
  ];
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  const edges: { from: string; to: string }[] = [];
  for (const l of links) {
    const from = l.from_note_id ? `sticky:${l.from_note_id}` : l.from_shape_id ? `shape:${l.from_shape_id}` : null;
    const to   = l.to_note_id   ? `sticky:${l.to_note_id}`   : l.to_shape_id   ? `shape:${l.to_shape_id}`   : null;
    if (from && to && from !== to && nodeByKey.has(from) && nodeByKey.has(to)) edges.push({ from, to });
  }

  // Union-find to group nodes into connected components — Dagre lays out one
  // graph at a time, so disconnected clusters must be tiled separately below.
  const parent = new Map<string, string>();
  nodes.forEach((n) => parent.set(n.key, n.key));
  function find(k: string): string {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  edges.forEach((e) => union(e.from, e.to));

  const componentMap = new Map<string, LayoutNode[]>();
  nodes.forEach((n) => {
    const root = find(n.key);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root)!.push(n);
  });

  interface ComponentLayout {
    positions: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
  }

  const components: ComponentLayout[] = [];
  for (const compNodes of componentMap.values()) {
    if (compNodes.length === 1) {
      const n = compNodes[0];
      components.push({ positions: new Map([[n.key, { x: 0, y: 0 }]]), width: n.width, height: n.height });
      continue;
    }

    const g = new Dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 50, marginx: 20, marginy: 20 });
    compNodes.forEach((n) => g.setNode(n.key, { width: n.width, height: n.height }));
    const compKeys = new Set(compNodes.map((n) => n.key));
    edges.filter((e) => compKeys.has(e.from) && compKeys.has(e.to)).forEach((e) => g.setEdge(e.from, e.to));

    Dagre.layout(g);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const raw = new Map<string, { x: number; y: number }>();
    compNodes.forEach((n) => {
      const node = g.node(n.key);
      const x = node.x - n.width / 2;
      const y = node.y - n.height / 2;
      raw.set(n.key, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + n.width);
      maxY = Math.max(maxY, y + n.height);
    });
    const positions = new Map<string, { x: number; y: number }>();
    raw.forEach((p, key) => positions.set(key, { x: p.x - minX, y: p.y - minY }));
    components.push({ positions, width: maxX - minX, height: maxY - minY });
  }

  // Tile components largest-first, wrapping into new rows to keep the board roughly square.
  components.sort((a, b) => b.width * b.height - a.width * a.height);

  const finalPositions = new Map<string, { x: number; y: number }>();
  let cursorX = 0, cursorY = 0, rowHeight = 0;
  for (const comp of components) {
    if (cursorX > 0 && cursorX + comp.width > AUTO_LAYOUT_MAX_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + AUTO_LAYOUT_COMPONENT_GAP;
      rowHeight = 0;
    }
    comp.positions.forEach((p, key) => finalPositions.set(key, { x: p.x + cursorX, y: p.y + cursorY }));
    cursorX += comp.width + AUTO_LAYOUT_COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, comp.height);
  }

  const stickyPositions = new Map<string, { x: number; y: number }>();
  const shapePositions = new Map<string, { x: number; y: number }>();
  finalPositions.forEach((pos, key) => {
    const n = nodeByKey.get(key)!;
    if (n.kind === "sticky") stickyPositions.set(n.id, pos);
    else shapePositions.set(n.id, pos);
  });

  return { stickyPositions, shapePositions };
}

interface Props {
  boardId: string;
  token: string;
  projectId: string;
  /** The project's own team -- required for every plain note this board
   *  writes onto a workflow (promoting a sticky to a story, or refreshing
   *  a linked story's note). `null` disables both (see each call site). */
  teamId: string | null;
  backlogJobId: string | null;
  templates: Workflow[];
  initialStickies: StickyNote[];
  initialLinks: NoteLink[];
  initialShapes: BoardShape[];
  teamMembers: TeamMember[];
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

const SHAPE_TYPES: ShapeType[] = ["rect", "circle", "diamond", "database", "cloud", "actor", "image"];

export default function IdeaBoard({ boardId, token, projectId, teamId, backlogJobId, templates, initialStickies, initialLinks, initialShapes, teamMembers }: Props) {
  const [stickies, setStickies] = useState<StickyNote[]>(initialStickies);
  const [links, setLinks] = useState<NoteLink[]>(initialLinks);

  // Surfaces failed saves instead of letting them fail silently — the change
  // still shows in the UI (optimistic update) until a reload, so a swallowed
  // error here looks exactly like data loss.
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportSaveError = useCallback((err: unknown) => {
    setSaveError(err instanceof Error ? err.message : "Failed to save change");
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 6000);
  }, []);

  const creatorNames = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach((m) => {
      const name = [m.user.first_name, m.user.last_name].filter(Boolean).join(" ").trim();
      if (name) map.set(m.user.id, name);
    });
    return map;
  }, [teamMembers]);

  const [shapes, setShapes] = useState<BoardShape[]>(initialShapes);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [addingShapeType, setAddingShapeType] = useState<ShapeType | null>(null);
  const [confirmDeleteShapeId, setConfirmDeleteShapeId] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [replacingImageShapeId, setReplacingImageShapeId] = useState<string | null>(null);
  const hasDamAccess = useMemo(() => checkDamAccess(token), [token]);

  // linkingFrom is either a sticky ID or shape ID; linkingFromKind discriminates
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [linkingFromKind, setLinkingFromKind] = useState<"sticky" | "shape">("sticky");
  const [linkingFromPort, setLinkingFromPort] = useState<Port | ShapePort | null>(null);
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
  // Persisted per-board so the view (including a Fit-to-screen zoom) survives
  // navigating away and back, instead of resetting to 100% on remount.

  const viewStorageKey = `togra_idea_board_view_${boardId}`;

  function loadStoredView(): { zoom: number; pan: { x: number; y: number } } {
    if (typeof window === "undefined") return { zoom: 1, pan: { x: 40, y: 40 } };
    try {
      const raw = localStorage.getItem(viewStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.zoom === "number" && parsed.pan) return parsed;
      }
    } catch { /* ignore */ }
    return { zoom: 1, pan: { x: 40, y: 40 } };
  }

  const [zoom, setZoomState] = useState(() => loadStoredView().zoom);
  const [pan, setPanState] = useState(() => loadStoredView().pan);
  // Refs so event handlers always read the latest values without closure stale issues
  const zoomRef = useRef(zoom);
  const panRef  = useRef(pan);

  const persistViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persistView(z: number, p: { x: number; y: number }) {
    if (persistViewTimerRef.current) clearTimeout(persistViewTimerRef.current);
    persistViewTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(viewStorageKey, JSON.stringify({ zoom: z, pan: p })); } catch { /* ignore */ }
    }, 250);
  }

  function setZoom(z: number) {
    zoomRef.current = z;
    setZoomState(z);
    persistView(z, panRef.current);
  }
  function setPan(p: { x: number; y: number }) {
    panRef.current = p;
    setPanState(p);
    persistView(zoomRef.current, p);
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
        persistView(newZoom, newPan);
      } else {
        const newPan = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        };
        panRef.current = newPan;
        setPanState(newPan);
        persistView(zoomRef.current, newPan);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Pure calculation so callers can fit to positions that haven't landed in
  // state yet (e.g. right after computing an auto-layout), not just the
  // currently-rendered stickies/shapes.
  function computeFit(items: { x: number; y: number; width: number; height: number }[]) {
    if (items.length === 0) return null;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const padding = 60;
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.width));
    const maxY = Math.max(...items.map((i) => i.y + i.height));
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const newZoom = Math.min(1, Math.min(rect.width / contentW, rect.height / contentH));
    // Center content: panX + (minX - padding) * zoom = (vw - contentW * zoom) / 2
    return {
      zoom: newZoom,
      pan: {
        x: (rect.width  - contentW * newZoom) / 2 - (minX - padding) * newZoom,
        y: (rect.height - contentH * newZoom) / 2 - (minY - padding) * newZoom,
      },
    };
  }

  function fitToSize() {
    const fit = computeFit([
      ...stickies.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
      ...shapes.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
    ]);
    if (!fit) return;
    setZoom(fit.zoom);
    setPan(fit.pan);
  }

  const [autoLayingOut, setAutoLayingOut] = useState(false);

  async function handleAutoLayout() {
    if (autoLayingOut || (stickies.length === 0 && shapes.length === 0)) return;
    setAutoLayingOut(true);
    try {
      const { stickyPositions, shapePositions } = autoLayoutBoard(stickies, shapes, links);

      setStickies((prev) => prev.map((s) => {
        const pos = stickyPositions.get(s.id);
        return pos ? { ...s, x: pos.x, y: pos.y } : s;
      }));
      setShapes((prev) => prev.map((s) => {
        const pos = shapePositions.get(s.id);
        return pos ? { ...s, x: pos.x, y: pos.y } : s;
      }));

      const fit = computeFit([
        ...stickies.map((s) => { const p = stickyPositions.get(s.id); return { x: p?.x ?? s.x, y: p?.y ?? s.y, width: s.width, height: s.height }; }),
        ...shapes.map((s) => { const p = shapePositions.get(s.id); return { x: p?.x ?? s.x, y: p?.y ?? s.y, width: s.width, height: s.height }; }),
      ]);
      if (fit) { setZoom(fit.zoom); setPan(fit.pan); }

      await Promise.all([
        ...[...stickyPositions.entries()].map(([id, pos]) =>
          updateSticky(token, boardId, id, { x: pos.x, y: pos.y }).catch(reportSaveError)
        ),
        ...[...shapePositions.entries()].map(([id, pos]) =>
          updateShape(token, boardId, id, { x: pos.x, y: pos.y }).catch(reportSaveError)
        ),
      ]);
    } finally {
      setAutoLayingOut(false);
    }
  }

  // ── Refresh — pulls in stickies/links/shapes created elsewhere (e.g. via MCP) ──

  async function handleRefresh() {
    const [s, l, sh] = await Promise.all([
      listStickies(token, boardId),
      listNoteLinks(token, boardId),
      listShapes(token, boardId),
    ]);
    setStickies(s);
    setLinks(l);
    setShapes(sh);
  }

  // ── Canvas mouse tracking for in-progress link line ──────────────────────

  useEffect(() => {
    if (!linkingFrom) return;

    function onMove(e: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const mouseY = (e.clientY - rect.top  - panRef.current.y) / zoomRef.current;

      const srcSticky = stickies.find((s) => s.id === linkingFrom);
      if (srcSticky) {
        const port = linkingFromPort ?? bestPortTo(srcSticky, mouseX, mouseY);
        const pp = portPos(srcSticky, port);
        setPendingLine({ x1: pp.x, y1: pp.y, x2: mouseX, y2: mouseY, port });
        return;
      }

      // Shape source
      const srcShape = shapesRef.current.find((s) => s.id === linkingFrom);
      if (!srcShape) return;
      const port = (linkingFromPort ?? bestShapePortTo(srcShape, mouseX, mouseY)) as Port;
      const pp = shapePortPos(srcShape, port);
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
    await updateSticky(token, boardId, id, { x, y }).catch(reportSaveError);
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
    await updateSticky(token, boardId, id, { width, height }).catch(reportSaveError);
  }, [token, boardId]);

  const stickiesRef = useRef(stickies);
  useEffect(() => { stickiesRef.current = stickies; }, [stickies]);

  const handleUpdate = useCallback(async (id: string, patch: { title?: string; body?: string; color?: StickyColor }) => {
    setStickies((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    await updateSticky(token, boardId, id, patch).catch(reportSaveError);
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
    setLinkingFromKind("sticky");
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
    const link = await createBoardLink(
      token, boardId,
      linkingFromKind === "shape" ? { shapeId: linkingFrom } : { noteId: linkingFrom },
      { noteId: targetId },
      linkingFromPort ?? undefined,
      targetPort,
    ).catch((err) => { reportSaveError(err); return null; });
    if (link) setLinks((prev) => [...prev, link]);
    setLinkingFrom(null);
    setLinkingFromPort(null);
    setPendingLine(null);
  }, [linkingFrom, linkingFromKind, linkingFromPort, token, boardId]);

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
    await updateSticky(token, boardId, stickyId, { workflow_id: workflowId }).catch(reportSaveError);
    setStickies((prev) => prev.map((s) => s.id === stickyId ? { ...s, workflow_id: workflowId } : s));
    setCreateStoryStickyId(null);
  }

  // ── Shape actions ─────────────────────────────────────────────────────────

  async function handleAddShape(type: ShapeType) {
    if (type === "image") {
      setAddingShapeType(type);
      setReplacingImageShapeId(null);
      setImagePickerOpen(true);
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 };
    const cx = Math.round((rect.width  / 2 - panRef.current.x) / zoomRef.current);
    const cy = Math.round((rect.height / 2 - panRef.current.y) / zoomRef.current);
    const { width, height } = DEFAULT_SHAPE_SIZES[type];
    const cascade = (nextOffset % 6) * 20;
    nextOffset++;
    const s = await createShape(token, boardId, {
      shape_type: type,
      x: cx - width / 2 + cascade,
      y: cy - height / 2 + cascade,
      width,
      height,
    });
    setShapes((prev) => [...prev, s]);
    setSelectedShapeId(s.id);
    setAddingShapeType(null);
  }

  async function handleImagePicked(asset: PickedAsset) {
    if (replacingImageShapeId) {
      const id = replacingImageShapeId;
      setImagePickerOpen(false);
      setReplacingImageShapeId(null);
      await handleShapePropsUpdate(id, { image_url: asset.thumbnailUrl });
      return;
    }
    await handleInsertImageShape(asset);
  }

  async function handleInsertImageShape(asset: PickedAsset) {
    setImagePickerOpen(false);
    const rect = canvasRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 };
    const cx = Math.round((rect.width  / 2 - panRef.current.x) / zoomRef.current);
    const cy = Math.round((rect.height / 2 - panRef.current.y) / zoomRef.current);
    const { width, height } = DEFAULT_SHAPE_SIZES.image;
    const cascade = (nextOffset % 6) * 20;
    nextOffset++;
    const s = await createShape(token, boardId, {
      shape_type: "image",
      x: cx - width / 2 + cascade,
      y: cy - height / 2 + cascade,
      width,
      height,
      image_url: asset.thumbnailUrl,
    }).catch((err) => { reportSaveError(err); return null; });
    setAddingShapeType(null);
    if (!s) return;
    setShapes((prev) => [...prev, s]);
    setSelectedShapeId(s.id);
  }

  const shapeDragRafRef = useRef<number | null>(null);

  const handleShapeDragMove = useCallback((id: string, x: number, y: number) => {
    if (shapeDragRafRef.current !== null) cancelAnimationFrame(shapeDragRafRef.current);
    shapeDragRafRef.current = requestAnimationFrame(() => {
      setShapes((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
      shapeDragRafRef.current = null;
    });
  }, []);

  const handleShapeDragEnd = useCallback(async (id: string, x: number, y: number) => {
    if (shapeDragRafRef.current !== null) { cancelAnimationFrame(shapeDragRafRef.current); shapeDragRafRef.current = null; }
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, x, y } : s));
    await updateShape(token, boardId, id, { x, y }).catch(reportSaveError);
  }, [token, boardId]);

  const shapeResizeRafRef = useRef<number | null>(null);

  const handleShapeResizeEnd = useCallback(async (id: string, width: number, height: number) => {
    if (shapeResizeRafRef.current !== null) { cancelAnimationFrame(shapeResizeRafRef.current); shapeResizeRafRef.current = null; }
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, width, height } : s));
    await updateShape(token, boardId, id, { width, height }).catch(reportSaveError);
  }, [token, boardId]);

  const handleShapePropsUpdate = useCallback(async (id: string, patch: Partial<BoardShape>) => {
    setShapes((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    await updateShape(token, boardId, id, patch).catch(reportSaveError);
  }, [token, boardId]);

  async function handleDeleteShape(id: string) {
    await deleteShape(token, boardId, id);
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_shape_id !== id && l.to_shape_id !== id));
    setConfirmDeleteShapeId(null);
    setSelectedShapeId(null);
  }

  // ── Shape link actions ────────────────────────────────────────────────────

  const handleStartLinkShape = useCallback((id: string, port: ShapePort) => {
    setLinkingFrom(id);
    setLinkingFromKind("shape");
    setLinkingFromPort(port);
    setPendingLine(null);
  }, []);

  const shapesRef = useRef(shapes);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);

  const handleFinishLinkShape = useCallback(async (targetId: string, targetPort: ShapePort) => {
    if (!linkingFrom || linkingFrom === targetId) {
      setLinkingFrom(null); setLinkingFromPort(null); setPendingLine(null); return;
    }
    const link = await createBoardLink(
      token, boardId,
      linkingFromKind === "shape" ? { shapeId: linkingFrom } : { noteId: linkingFrom },
      { shapeId: targetId },
      linkingFromPort ?? undefined,
      targetPort,
    ).catch((err) => { reportSaveError(err); return null; });
    if (link) setLinks((prev) => [...prev, link]);
    setLinkingFrom(null); setLinkingFromPort(null); setPendingLine(null);
  }, [linkingFrom, linkingFromKind, linkingFromPort, token, boardId]);

  // ── Override handleFinishLink to support finishing on a shape ─────────────
  // The existing handleFinishLink is for sticky targets. We gate on linkingFrom kind below in JSX.

  async function handleUpdateStory(stickyId: string) {
    const sticky = stickiesRef.current.find((s) => s.id === stickyId);
    if (!sticky?.workflow_id) return;
    if (!teamId) { reportSaveError(new Error("No team_id resolved for this board -- can't post a story update note.")); return; }
    const timestamp = new Date().toLocaleString(undefined, {
      dateStyle: "medium", timeStyle: "short",
    });
    try {
      await createTackNotesApi("/api/tack", token).createNote({
        team_id: teamId,
        visibility: "team",
        title: `${sticky.title} — ${timestamp}`,
        body_markdown: sticky.body ?? "",
        attach: { owning_service: OWNING_SERVICE, entity_type: "workflow", entity_id: sticky.workflow_id },
      });
    } catch (err) {
      // Leave the pending-update pill showing — the story note was NOT created,
      // so silently clearing it here would hide the fact that nothing synced.
      reportSaveError(err);
      return;
    }
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

        {/* Auto Layout */}
        <div className="pl-3 border-l border-slate-200">
          <button
            type="button"
            onClick={() => void handleAutoLayout()}
            disabled={autoLayingOut}
            title="Auto-layout — arrange stickies and shapes with no overlap"
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 ${autoLayingOut ? "animate-spin" : ""}`}>
              <path d="M8 2a.75.75 0 0 1 .553.244l4.25 4.5a.75.75 0 0 1-1.106 1.012L8 3.836 4.303 7.756a.75.75 0 0 1-1.106-1.012l4.25-4.5A.75.75 0 0 1 8 2Zm-4.553 8.256a.75.75 0 0 1 1.106 0L8 14.164l3.447-3.908a.75.75 0 1 1 1.106 1.012l-4 4.536a.75.75 0 0 1-1.106 0l-4-4.536a.75.75 0 0 1 0-1.012Z" />
            </svg>
            Auto Layout
          </button>
        </div>

        {/* Shape picker */}
        <div className="flex items-center gap-1 pl-3 border-l border-slate-200">
          {SHAPE_TYPES.filter((type) => type !== "image" || hasDamAccess).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleAddShape(type)}
              title={SHAPE_LABELS[type]}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors text-slate-500 hover:text-violet-700 hover:bg-violet-50 ${addingShapeType === type ? "bg-violet-100 text-violet-700" : ""}`}
            >
              <ShapeIcon type={type} size={16} />
            </button>
          ))}
        </div>

        {imagePickerOpen && (
          <DamPickerModal
            token={token}
            onSelect={handleImagePicked}
            onClose={() => { setImagePickerOpen(false); setAddingShapeType(null); setReplacingImageShapeId(null); }}
          />
        )}

        {linkingFrom && (
          <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 animate-pulse">
              <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
            </svg>
            Click a shape or sticky to link — <kbd className="font-mono bg-violet-100 px-1 rounded">Esc</kbd> to cancel
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">{stickies.length + shapes.length} items</span>
          <RefreshControl onRefresh={handleRefresh} storageKey="togra_ideas_refresh_interval" intervals={IDEAS_REFRESH_INTERVALS} />
        </div>
      </div>

      {/* Save error banner — a save that fails here would otherwise look fine
          until the next reload, since state is updated optimistically. */}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 shrink-0">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.964 0L.165 13.233c-.457.778.091 1.767.982 1.767h13.706c.89 0 1.438-.99.982-1.767L8.982 1.566ZM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5Zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
          </svg>
          <span className="flex-1">Failed to save: {saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
      )}

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
            setSelectedShapeId(null);
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
            persistView(zoomRef.current, newPan);
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
              // Resolve source and target port positions (sticky or shape)
              let srcPos: { x: number; y: number } | null = null;
              let tgtPos: { x: number; y: number } | null = null;
              let color = "#7c3aed";

              if (link.from_note_id) {
                const s = stickies.find((st) => st.id === link.from_note_id);
                if (!s) return null;
                const port = (link.from_port ?? bestPortFromSticky(s, link)) as Port;
                srcPos = portPos(s, port);
                color = CONNECTOR_COLORS[s.color] ?? color;
              } else if (link.from_shape_id) {
                const s = shapes.find((sh) => sh.id === link.from_shape_id);
                if (!s) return null;
                const port = (link.from_port ?? "right") as ShapePort;
                srcPos = shapePortPos(s, port);
              }

              if (link.to_note_id) {
                const s = stickies.find((st) => st.id === link.to_note_id);
                if (!s) return null;
                const port = (link.to_port ?? bestPortFromSticky(s, link)) as Port;
                tgtPos = portPos(s, port);
              } else if (link.to_shape_id) {
                const s = shapes.find((sh) => sh.id === link.to_shape_id);
                if (!s) return null;
                const port = (link.to_port ?? "left") as ShapePort;
                tgtPos = shapePortPos(s, port);
              }

              if (!srcPos || !tgtPos) return null;

              const dist = Math.hypot(tgtPos.x - srcPos.x, tgtPos.y - srcPos.y);
              const fromPort = (link.from_port ?? "right") as Port;
              const toPort   = (link.to_port   ?? "left")  as Port;
              const c1 = cpOffset(fromPort, dist);
              const c2 = cpOffset(toPort,   dist);
              const p1x = srcPos.x + c1.dx, p1y = srcPos.y + c1.dy;
              const p2x = tgtPos.x + c2.dx, p2y = tgtPos.y + c2.dy;
              const d = `M ${srcPos.x} ${srcPos.y} C ${p1x} ${p1y} ${p2x} ${p2y} ${tgtPos.x} ${tgtPos.y}`;
              const midX = 0.125*srcPos.x + 0.375*p1x + 0.375*p2x + 0.125*tgtPos.x;
              const midY = 0.125*srcPos.y + 0.375*p1y + 0.375*p2y + 0.125*tgtPos.y;
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
              creatorName={creatorNames.get(s.created_by) ?? null}
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

          {/* Shape nodes — rendered as an SVG overlay so they live in the same coordinate space */}
          {shapes.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ overflow: "visible", pointerEvents: "none" }}
            >
              {shapes.map((shape) => (
                <g key={shape.id} style={{ pointerEvents: "all" }}>
                  <ShapeNode
                    shape={shape}
                    zoom={zoom}
                    selected={selectedShapeId === shape.id}
                    linkingActive={!!linkingFrom && linkingFrom !== shape.id}
                    onSelect={() => { setSelectedShapeId(shape.id); }}
                    onDragMove={(x, y) => handleShapeDragMove(shape.id, x, y)}
                    onDragEnd={(x, y) => handleShapeDragEnd(shape.id, x, y)}
                    onResizeEnd={(w, h) => handleShapeResizeEnd(shape.id, w, h)}
                    onStartLink={(port) => handleStartLinkShape(shape.id, port)}
                    onFinishLink={(port) => handleFinishLinkShape(shape.id, port)}
                    onDoubleClick={() => setSelectedShapeId(shape.id)}
                  />
                </g>
              ))}
            </svg>
          )}
        </div>

        {/* Shape properties panel */}
        {selectedShapeId && (() => {
          const shape = shapes.find((s) => s.id === selectedShapeId);
          if (!shape) return null;
          return (
            <ShapePropsPanel
              shape={shape}
              onUpdate={(patch) => handleShapePropsUpdate(selectedShapeId, patch as Partial<BoardShape>)}
              onDelete={() => setConfirmDeleteShapeId(selectedShapeId)}
              onReplaceImage={() => {
                setReplacingImageShapeId(selectedShapeId);
                setAddingShapeType(null);
                setImagePickerOpen(true);
              }}
            />
          );
        })()}

        {stickies.length === 0 && shapes.length === 0 && (
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

      {/* Confirm delete shape */}
      {confirmDeleteShapeId && (
        <ConfirmDialog
          title="Delete shape?"
          message="This will permanently delete this shape and any links attached to it."
          confirmLabel="Delete"
          onConfirm={() => handleDeleteShape(confirmDeleteShapeId)}
          onCancel={() => setConfirmDeleteShapeId(null)}
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
            teamId={teamId}
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
  teamId,
  onCreated,
  onClose,
}: {
  sticky: StickyNote;
  jobId: string;
  templates: Workflow[];
  token: string;
  teamId: string | null;
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
        // is_end too — a fresh story is a single-task workflow until more steps are
        // added; whoever adds the next step should mark the real final one as the
        // end task instead (see WorkflowCanvas's "End task" checkbox on Add Step).
        await createTask(token, { name: "Define", workflow_id: story.id, is_start: true, is_end: true });
      }

      if (noteBody.trim()) {
        if (teamId) {
          await createTackNotesApi("/api/tack", token).createNote({
            team_id: teamId,
            visibility: "team",
            title: name.trim(),
            body_markdown: noteBody.trim(),
            attach: { owning_service: OWNING_SERVICE, entity_type: "workflow", entity_id: story.id },
          });
        } else {
          console.error(`CreateStoryFromIdeaModal: no team_id resolved for job ${jobId} -- skipping note`);
        }
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
