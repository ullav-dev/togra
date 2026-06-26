"use client";

import { useState, useRef, useCallback } from "react";
import type { BoardShape, ShapePort } from "./types";
import { getShapePorts, getShapePath } from "./paths";

const PORT_RADIUS = 5;
const HANDLE_SIZE = 8;

interface Props {
  shape: BoardShape;
  zoom: number;
  selected: boolean;
  linkingActive: boolean; // another node is being linked — show as a target
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onResizeEnd: (width: number, height: number) => void;
  onStartLink: (port: ShapePort) => void;
  onFinishLink: (port: ShapePort) => void;
  onDoubleClick: () => void;
}

export default function ShapeNode({
  shape,
  zoom,
  selected,
  linkingActive,
  onSelect,
  onDragEnd,
  onResizeEnd,
  onStartLink,
  onFinishLink,
  onDoubleClick,
}: Props) {
  const { shape_type, width: w, height: h } = shape;
  const ports = getShapePorts(shape_type, w, h);
  const [hoveredPort, setHoveredPort] = useState<ShapePort | null>(null);

  // ── Drag ──────────────────────────────────────────────────────────────────

  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const currentPos = useRef({ x: shape.x, y: shape.y });

  function onMouseDownDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (linkingActive) { onFinishLink("top"); return; } // port-agnostic finish
    onSelect();
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: shape.x, oy: shape.y };
    currentPos.current = { x: shape.x, y: shape.y };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / zoom;
      const dy = (ev.clientY - dragStart.current.my) / zoom;
      currentPos.current = {
        x: Math.round(dragStart.current.ox + dx),
        y: Math.round(dragStart.current.oy + dy),
      };
      // Optimistic local update via CSS transform on the SVG group is handled by parent
      // re-rendering via state. For smoothness, parent should use a ref-based approach.
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragStart.current = null;
      onDragEnd(currentPos.current.x, currentPos.current.y);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  const resizeStart = useRef<{
    mx: number; my: number;
    ow: number; oh: number;
    corner: string;
    keepAspect: boolean;
  } | null>(null);
  const currentSize = useRef({ width: w, height: h });

  function onMouseDownResize(e: React.MouseEvent, corner: string) {
    e.stopPropagation();
    e.preventDefault();
    const keepAspect = shape_type === "circle" || shape_type === "actor";
    resizeStart.current = { mx: e.clientX, my: e.clientY, ow: w, oh: h, corner, keepAspect };
    currentSize.current = { width: w, height: h };

    function onMove(ev: MouseEvent) {
      if (!resizeStart.current) return;
      const { mx, my, ow, oh, corner: c, keepAspect: ka } = resizeStart.current;
      const dx = (ev.clientX - mx) / zoom;
      const dy = (ev.clientY - my) / zoom;
      let nw = ow, nh = oh;
      if (c.includes("e")) nw = Math.max(60, ow + dx);
      if (c.includes("s")) nh = Math.max(40, oh + dy);
      if (ka) { const s = Math.max(nw, nh); nw = s; nh = s; }
      currentSize.current = { width: Math.round(nw), height: Math.round(nh) };
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizeStart.current = null;
      onResizeEnd(currentSize.current.width, currentSize.current.height);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const path = getShapePath(shape_type, w, h);
  const isActor = shape_type === "actor";
  const showPorts = selected || linkingActive;

  // For actor, the path contains multiple sub-paths (head circle + lines).
  // We split on "M" boundaries: first sub-path is fill (head), rest are stroke-only.
  const actorPaths = isActor
    ? path.split(/(?=M)/).filter(Boolean)
    : null;

  const labelX = w / 2;
  const labelY = shape_type === "actor" ? h + 14 : h / 2;
  const labelDominantBaseline = shape_type === "actor" ? "auto" : "middle";

  return (
    <g
      transform={`translate(${shape.x},${shape.y})`}
      style={{ cursor: "grab" }}
      onMouseDown={onMouseDownDrag}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
    >
      {/* Shape fill/stroke */}
      {isActor ? (
        <>
          {/* Head — filled */}
          <path
            d={actorPaths![0]}
            fill={shape.fill_color}
            stroke={shape.stroke_color}
            strokeWidth={shape.stroke_width}
          />
          {/* Body lines — stroke only */}
          {actorPaths!.slice(1).map((d, i) => (
            <path key={i} d={d} fill="none" stroke={shape.stroke_color} strokeWidth={shape.stroke_width} strokeLinecap="round" />
          ))}
        </>
      ) : shape_type === "cloud" ? (
        <CloudShape w={w} h={h} fill={shape.fill_color} stroke={shape.stroke_color} strokeWidth={shape.stroke_width} />
      ) : (
        <path
          d={path}
          fill={shape.fill_color}
          stroke={shape.stroke_color}
          strokeWidth={shape.stroke_width}
        />
      )}

      {/* Database: add interior line showing top cap */}
      {shape_type === "database" && (() => {
        const ry = Math.min(h * 0.14, 18);
        const rx = w / 2;
        return (
          <path
            d={`M0,${ry} A${rx},${ry} 0 0,0 ${w},${ry}`}
            fill="none"
            stroke={shape.stroke_color}
            strokeWidth={shape.stroke_width * 0.8}
            opacity={0.5}
          />
        );
      })()}

      {/* Label */}
      {shape.label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline={labelDominantBaseline}
          fontSize={shape.label_size}
          fill={shape.label_color}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {shape.label}
        </text>
      )}

      {/* Selection ring */}
      {selected && (
        <rect
          x={-4} y={-4}
          width={w + 8} height={h + 8}
          rx={4}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        />
      )}

      {/* Resize handles (SE corner only for simplicity; add others as needed) */}
      {selected && (
        <rect
          x={w - HANDLE_SIZE / 2}
          y={h - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          rx={2}
          fill="white"
          stroke="#7c3aed"
          strokeWidth={1.5}
          style={{ cursor: "se-resize" }}
          onMouseDown={(e) => onMouseDownResize(e, "se")}
        />
      )}

      {/* Port dots */}
      {showPorts && ports.map(({ port, x, y }) => (
        <circle
          key={port}
          cx={x}
          cy={y}
          r={PORT_RADIUS / zoom}
          fill={hoveredPort === port ? "#7c3aed" : "white"}
          stroke="#7c3aed"
          strokeWidth={1.5 / zoom}
          style={{ cursor: "crosshair" }}
          onMouseEnter={() => setHoveredPort(port)}
          onMouseLeave={() => setHoveredPort(null)}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (linkingActive) { onFinishLink(port); }
            else { onStartLink(port); }
          }}
        />
      ))}

      {/* Invisible hit area for finish-link when hovered (whole shape) */}
      {linkingActive && (
        <rect
          x={0} y={0} width={w} height={h}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onMouseDown={(e) => { e.stopPropagation(); onFinishLink("top"); }}
        />
      )}
    </g>
  );
}

// ── Cloud: rendered as overlapping SVG circles (easier than a compound path) ──

function CloudShape({ w, h, fill, stroke, strokeWidth }: {
  w: number; h: number; fill: string; stroke: string; strokeWidth: number;
}) {
  const s = Math.min(w, h);
  const scale = s / 100;
  const ox = (w - s) / 2;
  const oy = (h - s * 0.85) / 2;

  const circles: [number, number, number][] = [
    [50, 70, 30],
    [25, 60, 22],
    [75, 60, 22],
    [38, 45, 20],
    [62, 45, 20],
  ];

  return (
    <g>
      {/* White base to merge circles visually */}
      {circles.map(([cx, cy, r], i) => (
        <circle
          key={i}
          cx={ox + cx * scale}
          cy={oy + cy * scale}
          r={r * scale}
          fill={fill}
          stroke="none"
        />
      ))}
      {/* Stroke outline on top */}
      {circles.map(([cx, cy, r], i) => (
        <circle
          key={`s${i}`}
          cx={ox + cx * scale}
          cy={oy + cy * scale}
          r={r * scale}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ))}
    </g>
  );
}
