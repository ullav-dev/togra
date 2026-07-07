import type { ShapeType, ShapePortPoint } from "./types";

/** Returns the SVG path `d` string for a shape, normalised to origin (0,0). */
export function getShapePath(type: ShapeType, w: number, h: number): string {
  switch (type) {
    case "rect":
    case "image":
      return `M0,0 H${w} V${h} H0 Z`;

    case "circle":
      // Ellipse as a path so it composes with getShapeClipPath uniformly
      return ellipsePath(w / 2, h / 2, w / 2, h / 2);

    case "diamond": {
      const cx = w / 2, cy = h / 2;
      return `M${cx},0 L${w},${cy} L${cx},${h} L0,${cy} Z`;
    }

    case "database": {
      const ry = Math.max(Math.min(h * 0.18, 24), 8);
      const rx = w / 2;
      // Rendered via DatabaseShape component; this path is used only as a fallback hit area
      return [
        `M0,${ry}`,
        `A${rx},${ry} 0 1,0 ${w},${ry}`,
        `A${rx},${ry} 0 1,0 0,${ry}`,
        `M0,${ry} V${h - ry}`,
        `A${rx},${ry} 0 0,1 ${w},${h - ry}`,
        `V${ry} Z`,
      ].join(" ");
    }

    case "cloud":
      return cloudPath(w, h);

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
    case "image":
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
      // ry matches DatabaseShape component (h*0.18, capped at 24)
      const ry = Math.max(Math.min(h * 0.18, 24), 8);
      return [
        { port: "top",    x: w / 2, y: 0        },
        { port: "right",  x: w,     y: h / 2    },
        { port: "bottom", x: w / 2, y: h        },
        { port: "left",   x: 0,     y: h / 2    },
      ];
    }

    case "actor": {
      const headR    = Math.min(w * 0.28, h * 0.18);
      const shoulderY = headR * 2 + h * 0.05;
      const armY     = shoulderY + h * 0.08;
      const armSpan  = w * 0.45;
      const cx       = w / 2;
      return [
        { port: "top",    x: cx,             y: 0    },
        { port: "right",  x: cx + armSpan,   y: armY },
        { port: "bottom", x: cx,             y: h    },
        { port: "left",   x: cx - armSpan,   y: armY },
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

function cloudPath(w: number, h: number): string {
  // Cloud outline adapted from mxGraph's mxCloud shape — traces a recognisable cloud silhouette
  // using cubic Bézier segments, clockwise from the upper-left lobe.
  const p = (x: number, y: number) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`;
  return [
    `M${p(0.25, 0.25)}`,
    `C${p(0.05, 0.25)} ${p(0.00, 0.50)} ${p(0.16, 0.55)}`,
    `C${p(0.00, 0.66)} ${p(0.18, 0.90)} ${p(0.31, 0.80)}`,
    `C${p(0.40, 1.00)} ${p(0.70, 1.00)} ${p(0.80, 0.80)}`,
    `C${p(1.00, 0.80)} ${p(1.00, 0.60)} ${p(0.875, 0.50)}`,
    `C${p(1.00, 0.30)} ${p(0.80, 0.10)} ${p(0.625, 0.20)}`,
    `C${p(0.50, 0.00)} ${p(0.30, 0.00)} ${p(0.25, 0.25)}`,
    `Z`,
  ].join(' ');
}
