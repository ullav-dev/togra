"use client";

import { useState, useRef, useCallback } from "react";
import type { StickyNote, StickyColor } from "@/lib/types";
import MarkdownEditor from "@/components/MarkdownEditor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const STICKY_COLORS: Record<StickyColor, { bg: string; border: string; header: string }> = {
  yellow: { bg: "bg-yellow-50",  border: "border-yellow-300", header: "bg-yellow-200" },
  pink:   { bg: "bg-pink-50",    border: "border-pink-300",   header: "bg-pink-200"   },
  blue:   { bg: "bg-blue-50",    border: "border-blue-300",   header: "bg-blue-200"   },
  green:  { bg: "bg-emerald-50", border: "border-emerald-300",header: "bg-emerald-200"},
  purple: { bg: "bg-violet-50",  border: "border-violet-300", header: "bg-violet-200" },
  orange: { bg: "bg-orange-50",  border: "border-orange-300", header: "bg-orange-200" },
};

const COLOR_OPTIONS: StickyColor[] = ["yellow", "pink", "blue", "green", "purple", "orange"];

const HEADER_DOT: Record<StickyColor, string> = {
  yellow: "bg-yellow-400",
  pink:   "bg-pink-400",
  blue:   "bg-blue-400",
  green:  "bg-emerald-400",
  purple: "bg-violet-400",
  orange: "bg-orange-400",
};

interface Props {
  sticky: StickyNote;
  isLinking: boolean;
  isLinkSource: boolean;
  isLinkTarget: boolean;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onResizeMove: (id: string, width: number, height: number) => void;
  onResizeEnd: (id: string, width: number, height: number) => void;
  onUpdate: (id: string, patch: { title?: string; body?: string; color?: StickyColor }) => void;
  onDelete: (id: string) => void;
  onStartLink: (id: string) => void;
  onFinishLink: (id: string) => void;
}

export default function StickyCard({
  sticky,
  isLinking,
  isLinkSource,
  isLinkTarget,
  onDragMove,
  onDragEnd,
  onResizeMove,
  onResizeEnd,
  onUpdate,
  onDelete,
  onStartLink,
  onFinishLink,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(sticky.title);
  const [body, setBody] = useState(sticky.body ?? "");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [localSize, setLocalSize] = useState({ w: sticky.width, h: sticky.height });

  const dragStart  = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resizeStart = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const theme = STICKY_COLORS[sticky.color];

  // ── Dragging via pointer events ───────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    if (isLinking) {
      onFinishLink(sticky.id);
      return;
    }
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: sticky.x, oy: sticky.y };
  }, [editing, isLinking, sticky.id, sticky.x, sticky.y, onFinishLink]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || editing) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    const x = Math.max(0, dragStart.current.ox + dx);
    const y = Math.max(0, dragStart.current.oy + dy);
    const el = cardRef.current;
    if (el) {
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
    }
    onDragMove(sticky.id, x, y);
  }, [editing, sticky.id, onDragMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    const newX = Math.max(0, dragStart.current.ox + dx);
    const newY = Math.max(0, dragStart.current.oy + dy);
    dragStart.current = null;
    onDragEnd(sticky.id, newX, newY);
  }, [sticky.id, onDragEnd]);

  // ── Resizing via pointer events ───────────────────────────────────────────

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStart.current = { px: e.clientX, py: e.clientY, ow: localSize.w, oh: localSize.h };
  }, [localSize]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStart.current) return;
    const w = Math.max(160, resizeStart.current.ow + (e.clientX - resizeStart.current.px));
    const h = Math.max(120, resizeStart.current.oh + (e.clientY - resizeStart.current.py));
    setLocalSize({ w, h });
    onResizeMove(sticky.id, w, h);
  }, [sticky.id, onResizeMove]);

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (!resizeStart.current) return;
    const w = Math.max(160, resizeStart.current.ow + (e.clientX - resizeStart.current.px));
    const h = Math.max(120, resizeStart.current.oh + (e.clientY - resizeStart.current.py));
    resizeStart.current = null;
    setLocalSize({ w, h });
    onResizeEnd(sticky.id, w, h);
  }, [sticky.id, onResizeEnd]);

  // ── Editing ───────────────────────────────────────────────────────────────

  function saveEdit() {
    if (title.trim() === "" && body.trim() === "") return;
    onUpdate(sticky.id, {
      title: title.trim() || sticky.title,
      body:  body || undefined,
    });
    setEditing(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ring = isLinkSource
    ? "ring-2 ring-violet-500 ring-offset-1"
    : isLinkTarget && isLinking
    ? "ring-2 ring-emerald-400 ring-offset-1 cursor-crosshair"
    : isLinking
    ? "cursor-crosshair"
    : "";

  return (
    <div
      ref={cardRef}
      className={`group absolute border rounded-xl shadow-md flex flex-col select-none
        ${theme.bg} ${theme.border} ${ring}
        ${!editing && !isLinking ? "cursor-grab active:cursor-grabbing" : ""}
      `}
      style={{ left: sticky.x, top: sticky.y, width: localSize.w, height: localSize.h, minWidth: 160, minHeight: 120 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Header bar — this IS the drag handle; data-no-drag only on individual buttons */}
      <div className={`${theme.header} px-2 py-1.5 flex items-center gap-1.5 shrink-0`}>
        <span className={`w-2.5 h-2.5 rounded-full ${HEADER_DOT[sticky.color]}`} />
        {editing ? (
          <input
            data-no-drag
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditing(false); }}
            className="flex-1 bg-transparent text-xs font-semibold text-slate-800 outline-none border-none min-w-0"
          />
        ) : (
          <span
            data-no-drag
            className="flex-1 text-xs font-semibold text-slate-800 truncate cursor-text"
            onDoubleClick={() => setEditing(true)}
          >
            {sticky.title || "Untitled"}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {/* Color picker */}
          <div className="relative" data-no-drag>
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              className="p-0.5 rounded hover:bg-black/10 transition-colors"
              title="Change color"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-600">
                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm0-10a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6A.75.75 0 0 1 8 3.5Z"/>
              </svg>
            </button>
            {showColorPicker && (
              <div className="absolute top-full right-0 mt-1 flex gap-1 bg-white rounded-lg border border-slate-200 shadow-lg p-1.5 z-30">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { onUpdate(sticky.id, { color: c }); setShowColorPicker(false); }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${HEADER_DOT[c]} ${
                      c === sticky.color ? "border-slate-600" : "border-transparent"
                    }`}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Link */}
          <button
            type="button"
            data-no-drag
            onClick={() => onStartLink(sticky.id)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            title="Draw link from this sticky"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-600">
              <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/>
            </svg>
          </button>

          {/* Edit */}
          <button
            type="button"
            data-no-drag
            onClick={() => setEditing(true)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            title="Edit sticky"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-600">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064L11.19 6.25Z"/>
            </svg>
          </button>

          {/* Delete */}
          <button
            type="button"
            data-no-drag
            onClick={() => onDelete(sticky.id)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            title="Delete sticky"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-red-500">
              <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0" data-no-drag onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <div className="flex flex-col gap-1">
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Add content…"
              height={Math.max(60, localSize.h - 100)}
            />
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded transition-colors">Cancel</button>
              <button type="button" onClick={saveEdit} className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-2 py-0.5 rounded transition-colors">Save</button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-700 leading-relaxed prose prose-xs max-w-none">
            {sticky.body ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{sticky.body}</ReactMarkdown>
            ) : (
              <span className="text-slate-400 italic">Double-click to add content…</span>
            )}
          </div>
        )}
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        data-no-drag
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end pb-0.5 pr-0.5 opacity-30 hover:opacity-70 transition-opacity"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      >
        <svg viewBox="0 0 8 8" fill="currentColor" className="w-3 h-3 text-slate-500">
          <path d="M6 2 L2 6 M8 4 L4 8 M8 7 L7 8"/>
        </svg>
      </div>

      {/* Connection points — visible on target stickies during linking */}
      {isLinking && !isLinkSource && (
        <>
          {[
            { style: { top: "-7px",  left: "50%",  transform: "translateX(-50%)" } },
            { style: { bottom: "-7px", left: "50%", transform: "translateX(-50%)" } },
            { style: { left: "-7px", top: "50%",   transform: "translateY(-50%)" } },
            { style: { right: "-7px", top: "50%",  transform: "translateY(-50%)" } },
          ].map((pos, i) => (
            <div
              key={i}
              data-no-drag
              className="absolute w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-white shadow-md
                         cursor-crosshair animate-pulse hover:bg-violet-600 hover:scale-125 transition-transform z-10"
              style={pos.style}
              onPointerDown={(e) => { e.stopPropagation(); onFinishLink(sticky.id); }}
            />
          ))}
        </>
      )}

      {/* Source indicator — ring on the sticky that started the link */}
      {isLinkSource && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-violet-500 ring-offset-1 pointer-events-none animate-pulse" />
      )}
    </div>
  );
}
