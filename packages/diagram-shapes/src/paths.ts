import type { ShapeType, ShapePortPoint } from "./types";

/** Returns the SVG path `d` string for a shape, normalised to origin (0,0). */
export function getShapePath(type: ShapeType, w: number, h: number): string {
  switch (type) {
    case "rect":
      return `M0,0 H${w} V${h} H0 Z`;

    case "circle":
      // Ellipse as a path so it composes with getShapeClipPath uniformly
      return ellipsePath(w / 2, h / 2, w / 2, h / 2);

    case "diamond": {
      const cx = w / 2, cy = h / 2;
      return `M${cx},0 L${w},${cy} L${cx},${h} L0,${cy} Z`;
    }

    case "database": {
      const ry = Math.min(h * 0.14, 18); // ellipse half-height for caps
      const rx = w / 2;
      const cy = ry;
      const bodyBottom = h - ry;
      // Top ellipse + right side + bottom ellipse arc (open) + left side
      return [
        `M0,${cy}`,
        ellipseTopArc(rx, cy, rx, ry),       // top ellipse (full)
        `L${w},${bodyBottom}`,               // right edge down
        ellipseBottomArc(rx, bodyBottom, rx, ry), // bottom arc
        `L0,${cy}`,                          // left edge up
        `Z`,
      ].join(" ");
    }

    case "cloud": {
      // 5-circle composite cloud, scaled to fit w×h
      const s = Math.min(w, h);
      const scale = s / 100;
      // Circles (cx, cy, r) in 100×100 space, then scale + translate to fit bounds
      const circles: [number, number, number][] = [
        [50, 70, 30],  // main body
        [25, 60, 22],  // left lobe
        [75, 60, 22],  // right lobe
        [38, 45, 20],  // upper-left lobe
        [62, 45, 20],  // upper-right lobe
      ];
      const ox = (w - s) / 2;
      const oy = (h - s * 0.85) / 2;
      return cloudPath(circles, scale, ox, oy);
    }

    case "actor": {
      const cx = w / 2;
      const headR = Math.min(w * 0.28, h * 0.18);
      const headCy = headR;
      const shoulderY = headR * 2 + h * 0.05;
      const waistY = shoulderY + h * 0.22;
      const feetY = h;
      const armSpan = w * 0.45;
      const armY = shoulderY + h * 0.08;
      return [
        // Head circle
        ellipsePath(cx, headCy, headR, headR),
        // Body line
        `M${cx},${shoulderY} L${cx},${waistY}`,
        // Arms
        `M${cx - armSpan},${armY} L${cx + armSpan},${armY}`,
        // Left leg
        `M${cx},${waistY} L${cx - w * 0.3},${feetY}`,
        // Right leg
        `M${cx},${waistY} L${cx + w * 0.3},${feetY}`,
      ].join(" ");
    }
  }
}

/** Port attachment points in local (0,0) coordinate space. */
export function getShapePorts(type: ShapeType, w: number, h: number): ShapePortPoint[] {
  switch (type) {
    case "rect":
    case "cloud":
      return cardinalPorts(w, h);

    case "circle":
      return cardinalPorts(w, h); // ellipse cardinal points

    case "diamond":
      // Attach at the 4 tips
      return [
        { port: "top",    x: w / 2, y: 0     },
        { port: "right",  x: w,     y: h / 2 },
        { port: "bottom", x: w / 2, y: h     },
        { port: "left",   x: 0,     y: h / 2 },
      ];

    case "database": {
      const ry = Math.min(h * 0.14, 18);
      return [
        { port: "top",    x: w / 2, y: 0     },
        { port: "right",  x: w,     y: h / 2 },
        { port: "bottom", x: w / 2, y: h     },
        { port: "left",   x: 0,     y: h / 2 },
      ];
    }

    case "actor": {
      const headR = Math.min(w * 0.28, h * 0.18);
      const shoulderY = headR * 2 + h * 0.05;
      const armY = shoulderY + h * 0.08;
      return [
        { port: "top",    x: w / 2,        y: 0    },
        { port: "right",  x: w,            y: armY },
        { port: "bottom", x: w / 2,        y: h    },
        { port: "left",   x: 0,            y: armY },
      ];
    }
  }
}

/** Absolute port position given a shape's canvas position. */
export function shapePortPos(
  shape: { x: number; y: number; width: number; height: number; shape_type: ShapeType },
  port: "top" | "right" | "bottom" | "left",
): { x: number; y: number } {
  const ports = getShapePorts(shape.shape_type, shape.width, shape.height);
  const p = ports.find((pt) => pt.port === port) ?? { x: shape.width / 2, y: shape.height / 2 };
  return { x: shape.x + p.x, y: shape.y + p.y };
}

/** Which port faces most directly toward (toX, toY) from this shape's centre. */
export function bestShapePortTo(
  shape: { x: number; y: number; width: number; height: number; shape_type: ShapeType },
  toX: number,
  toY: number,
): "top" | "right" | "bottom" | "left" {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = toX - cx;
  const dy = toY - cy;
  const a = Math.atan2(dy, dx) * (180 / Math.PI);
  if (a > -45 && a <= 45)   return "right";
  if (a > 45  && a <= 135)  return "bottom";
  if (a > 135 || a <= -135) return "left";
  return "top";
}

// ── Private helpers ──────────────────────────────────────────────────────────

function cardinalPorts(w: number, h: number): ShapePortPoint[] {
  return [
    { port: "top",    x: w / 2, y: 0     },
    { port: "right",  x: w,     y: h / 2 },
    { port: "bottom", x: w / 2, y: h     },
    { port: "left",   x: 0,     y: h / 2 },
  ];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return [
    `M${cx - rx},${cy}`,
    `A${rx},${ry} 0 1,0 ${cx + rx},${cy}`,
    `A${rx},${ry} 0 1,0 ${cx - rx},${cy}`,
    `Z`,
  ].join(" ");
}

function ellipseTopArc(cx: number, cy: number, rx: number, ry: number): string {
  // Full top ellipse (clockwise)
  return `A${rx},${ry} 0 1,1 ${cx * 2},${cy} A${rx},${ry} 0 1,1 0,${cy}`;
}

function ellipseBottomArc(cx: number, cy: number, rx: number, ry: number): string {
  // Bottom arc only (left to right, convex downward)
  return `A${rx},${ry} 0 0,0 ${cx * 2},${cy}`;
}

function cloudPath(
  circles: [number, number, number][],
  scale: number,
  ox: number,
  oy: number,
): string {
  // Render each circle as a path — the browser's fill-rule handles the union visually.
  // For a true union we'd need Bezier approximation; this approach works with
  // fill="..." on a <g> with all paths, or a single compound path at the cost of gaps.
  // We use individual <circle> elements in the component for simplicity.
  // This function returns a simplified rounded rectangle as a lightweight fallback.
  const w = 100 * scale;
  const h = 85 * scale;
  const r = 28 * scale;
  return `M${ox + r},${oy} H${ox + w - r} Q${ox + w},${oy} ${ox + w},${oy + r} V${oy + h - r} Q${ox + w},${oy + h} ${ox + w - r},${oy + h} H${ox + r} Q${ox},${oy + h} ${ox},${oy + h - r} V${oy + r} Q${ox},${oy} ${ox + r},${oy} Z`;
}
