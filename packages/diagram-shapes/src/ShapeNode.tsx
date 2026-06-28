"use client";

import { useState, useRef } from "react";
import type { BoardShape, ShapePort } from "./types";
import { getShapePorts, getShapePath } from "./paths";

const PORT_RADIUS = 5;
const HANDLE_SIZE = 8;

interface Props {
  shape: BoardShape;
  zoom: number;
  selected: boolean;
  linkingActive: boolean;
  onSelect: () => void;
  onDragMove: (x: number, y: number) => void;
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
  onDragMove,
  onDragEnd,
  onResizeEnd,
  onStartLink,
  onFinishLink,
  onDoubleClick,
}: Props) {
  const { shape_type, width: w, height: h } = shape;

  const [hoveredPort, setHoveredPort] = useState<ShapePort | null>(null);

  // Live resize state — null when not resizing (shape props are used instead)
  const [pendingSize, setPendingSize] = useState<{ w: number; h: number } | null>(null);
  const liveW = pendingSize?.w ?? w;
  const liveH = pendingSize?.h ?? h;

  const ports = getShapePorts(shape_type, liveW, liveH);
  const path  = getShapePath(shape_type, liveW, liveH);

  // ── Drag ──────────────────────────────────────────────────────────────────

  const dragStart  = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const currentPos = useRef({ x: shape.x, y: shape.y });
  const dragRafRef = useRef<number | null>(null);

  function onMouseDownDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (linkingActive) { onFinishLink("top"); return; }
    onSelect();
    dragStart.current  = { mx: e.clientX, my: e.clientY, ox: shape.x, oy: shape.y };
    currentPos.current = { x: shape.x, y: shape.y };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / zoom;
      const dy = (ev.clientY - dragStart.current.my) / zoom;
      const nx = Math.round(dragStart.current.ox + dx);
      const ny = Math.round(dragStart.current.oy + dy);
      currentPos.current = { x: nx, y: ny };
      if (dragRafRef.current !== null) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = requestAnimationFrame(() => {
        onDragMove(nx, ny);
        dragRafRef.current = null;
      });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragRafRef.current !== null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
      dragStart.current = null;
      onDragEnd(currentPos.current.x, currentPos.current.y);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  const resizeStart   = useRef<{ mx: number; my: number; ow: number; oh: number; corner: string; keepAspect: boolean } | null>(null);
  const currentSize   = useRef({ width: w, height: h });
  const resizeRafRef  = useRef<number | null>(null);

  function onMouseDownResize(e: React.MouseEvent, corner: string) {
    e.stopPropagation();
    e.preventDefault();
    const keepAspect = shape_type === "circle" || shape_type === "actor";
    resizeStart.current  = { mx: e.clientX, my: e.clientY, ow: w, oh: h, corner, keepAspect };
    currentSize.current  = { width: w, height: h };

    function onMove(ev: MouseEvent) {
      if (!resizeStart.current) return;
      const { mx, my, ow, oh, corner: c, keepAspect: ka } = resizeStart.current;
      const dx = (ev.clientX - mx) / zoom;
      const dy = (ev.clientY - my) / zoom;
      let nw = ow, nh = oh;
      if (c.includes("e")) nw = Math.max(20, ow + dx);
      if (c.includes("s")) nh = Math.max(20, oh + dy);
      if (ka) {
        // Scale uniformly: pick whichever dimension grew more and apply the
        // same proportional scale to both, preserving the original aspect ratio.
        const scale = Math.max(nw / ow, nh / oh);
        nw = ow * scale;
        nh = oh * scale;
      }
      const rw = Math.round(nw);
      const rh = Math.round(nh);
      currentSize.current = { width: rw, height: rh };
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        setPendingSize({ w: rw, h: rh });
        resizeRafRef.current = null;
      });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (resizeRafRef.current !== null) { cancelAnimationFrame(resizeRafRef.current); resizeRafRef.current = null; }
      setPendingSize(null);
      resizeStart.current = null;
      onResizeEnd(currentSize.current.width, currentSize.current.height);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isActor = shape_type === "actor";
  const showPorts = selected || linkingActive;

  const actorPaths = isActor
    ? path.split(/(?=M)/).filter(Boolean)
    : null;

  const labelX = liveW / 2;
  const labelY = shape_type === "actor" ? liveH + 14 : liveH / 2;
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
          <path
            d={actorPaths![0]}
            fill={shape.fill_color}
            stroke={shape.stroke_color}
            strokeWidth={shape.stroke_width}
          />
          {actorPaths!.slice(1).map((d, i) => (
            <path key={i} d={d} fill="none" stroke={shape.stroke_color} strokeWidth={shape.stroke_width} strokeLinecap="round" />
          ))}
        </>
      ) : shape_type === "database" ? (
        <DatabaseShape w={liveW} h={liveH} fill={shape.fill_color} stroke={shape.stroke_color} strokeWidth={shape.stroke_width} />
      ) : (
        <path
          d={path}
          fill={shape.fill_color}
          stroke={shape.stroke_color}
          strokeWidth={shape.stroke_width}
        />
      )}

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
          width={liveW + 8} height={liveH + 8}
          rx={4}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        />
      )}

      {/* Resize handle (SE corner) */}
      {selected && (
        <rect
          x={liveW - HANDLE_SIZE / 2}
          y={liveH - HANDLE_SIZE / 2}
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

      {/* Invisible hit area — rendered before port dots so ports sit on top and win specific clicks.
          Catches clicks in the empty bounding-box area as a port-agnostic finish. */}
      {linkingActive && (
        <rect
          x={0} y={0} width={liveW} height={liveH}
          fill="none"
          pointerEvents="all"
          style={{ cursor: "crosshair" }}
          onMouseDown={(e) => { e.stopPropagation(); onFinishLink("top"); }}
        />
      )}

      {/* Port dots — last in document order so they receive events before the hit rect */}
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
    </g>
  );
}

// ── Database: cylinder rendered with ellipse cap + rect body + bottom arc ─────

function DatabaseShape({ w, h, fill, stroke, strokeWidth }: {
  w: number; h: number; fill: string; stroke: string; strokeWidth: number;
}) {
  const ry = Math.max(Math.min(h * 0.18, 24), 8);
  const rx = w / 2;
  return (
    <g>
      {/* Body fill (no stroke — sides and caps provide borders) */}
      <rect x={0} y={ry} width={w} height={h - ry * 2} fill={fill} stroke="none" />
      {/* Bottom cap: semi-ellipse bowing downward.
          sweep=0 (negative-angle direction) from left→right traces the BOTTOM half of the ellipse (y > h-ry). */}
      <path
        d={`M0,${h - ry} A${rx},${ry} 0 0,0 ${w},${h - ry}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {/* Body sides */}
      <line x1={0} y1={ry} x2={0} y2={h - ry} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={w} y1={ry} x2={w} y2={h - ry} stroke={stroke} strokeWidth={strokeWidth} />
      {/* Top cap: full ellipse drawn last — covers side line tops; interior line shows naturally */}
      <ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}
