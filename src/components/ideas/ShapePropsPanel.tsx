"use client";

import { useState, useEffect } from "react";
import type { BoardShape } from "@ullav-dev/diagram-shapes";

const FILL_PRESETS = [
  "#ffffff", "#f1f5f9", "#ddd6fe", "#fce7f3", "#dbeafe",
  "#d1fae5", "#fef3c7", "#fee2e2", "#1e293b", "#7c3aed",
];
const STROKE_PRESETS = [
  "#64748b", "#1e293b", "#7c3aed", "#2563eb", "#059669",
  "#d97706", "#dc2626", "#ffffff", "#94a3b8",
];
const LABEL_COLOR_PRESETS = ["#1e293b", "#ffffff", "#7c3aed", "#2563eb", "#dc2626"];

interface Props {
  shape: BoardShape;
  onUpdate: (patch: Partial<BoardShape>) => void;
  onDelete: () => void;
  onReplaceImage?: () => void;
}

export default function ShapePropsPanel({ shape, onUpdate, onDelete, onReplaceImage }: Props) {
  const isImage = shape.shape_type === "image";
  const [label, setLabel] = useState(shape.label ?? "");

  useEffect(() => { setLabel(shape.label ?? ""); }, [shape.id, shape.label]);

  function commitLabel() {
    const v = label.trim() || null;
    if (v !== shape.label) onUpdate({ label: v });
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-3 flex items-center gap-4 text-xs select-none">

      {/* Label */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium shrink-0">Label</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); }}
          placeholder="Add label…"
          className="w-28 border border-slate-200 rounded-md px-2 py-1 text-xs focus:border-violet-400 focus:outline-none"
        />
      </div>

      <div className="h-5 w-px bg-slate-200" />

      {/* Fill colour */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium shrink-0">Fill</span>
        <ColorRow
          presets={FILL_PRESETS}
          value={shape.fill_color}
          onChange={(c) => onUpdate({ fill_color: c })}
        />
      </div>

      <div className="h-5 w-px bg-slate-200" />

      {/* Stroke colour */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium shrink-0">Stroke</span>
        <ColorRow
          presets={STROKE_PRESETS}
          value={shape.stroke_color}
          onChange={(c) => onUpdate({ stroke_color: c })}
        />
        {/* Stroke width */}
        <select
          value={shape.stroke_width}
          onChange={(e) => onUpdate({ stroke_width: Number(e.target.value) })}
          className="border border-slate-200 rounded-md px-1 py-1 text-xs focus:border-violet-400 focus:outline-none"
        >
          <option value={1}>Thin</option>
          <option value={2}>Medium</option>
          <option value={3.5}>Thick</option>
        </select>
      </div>

      <div className="h-5 w-px bg-slate-200" />

      {/* Label colour + size */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium shrink-0">Text</span>
        <ColorRow
          presets={LABEL_COLOR_PRESETS}
          value={shape.label_color}
          onChange={(c) => onUpdate({ label_color: c })}
        />
        <select
          value={shape.label_size}
          onChange={(e) => onUpdate({ label_size: Number(e.target.value) })}
          className="border border-slate-200 rounded-md px-1 py-1 text-xs focus:border-violet-400 focus:outline-none"
        >
          <option value={11}>Small</option>
          <option value={13}>Medium</option>
          <option value={16}>Large</option>
          <option value={20}>XL</option>
        </select>
      </div>

      {isImage && onReplaceImage && (
        <>
          <div className="h-5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={onReplaceImage}
            className="flex items-center gap-1.5 text-slate-500 hover:text-violet-700 transition-colors"
            title="Replace image"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="1.5" y="2.5" width="9" height="9" rx="1.2" />
              <circle cx="4.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
              <path d="M2.5 9.5 L5 7 L7 8.7 L8.5 7 L10.5 9" />
              <path d="M12.5 3v3M12.5 3l-1.4 1.4M12.5 3l1.4 1.4M12.5 13v-3M12.5 13l-1.4-1.4M12.5 13l1.4-1.4" />
            </svg>
            Replace image
          </button>
        </>
      )}

      <div className="h-5 w-px bg-slate-200" />

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="text-slate-400 hover:text-red-500 transition-colors"
        title="Delete shape"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.559a.75.75 0 1 0-1.492.14l.62 6.498A1.75 1.75 0 0 0 5.365 14.8h5.27a1.75 1.75 0 0 0 1.741-1.603l.62-6.498a.75.75 0 1 0-1.492-.14l-.62 6.498a.25.25 0 0 1-.249.229H5.365a.25.25 0 0 1-.249-.229l-.62-6.498Z"/>
        </svg>
      </button>
    </div>
  );
}

function ColorRow({ presets, value, onChange }: {
  presets: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: c, borderColor: c === value ? "#7c3aed" : "#e2e8f0" }}
          className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
          title={c}
        />
      ))}
      {/* Free-pick */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0"
        title="Custom colour"
      />
    </div>
  );
}
