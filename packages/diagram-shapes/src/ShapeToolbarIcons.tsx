"use client";

import type { ShapeType } from "./types";

/** Small inline SVG icon for each shape type, suitable for a toolbar button. */
export function ShapeIcon({ type, size = 20 }: { type: ShapeType; size?: number }) {
  const s = size;
  const sw = 1.5;

  switch (type) {
    case "rect":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw}>
          <rect x="2" y="4" width="16" height="12" rx="1.5" />
        </svg>
      );
    case "circle":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw}>
          <ellipse cx="10" cy="10" rx="8" ry="8" />
        </svg>
      );
    case "diamond":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw}>
          <polygon points="10,2 18,10 10,18 2,10" />
        </svg>
      );
    case "database":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw}>
          <ellipse cx="10" cy="5" rx="7" ry="3" />
          <path d="M3,5 V15 Q3,18 10,18 Q17,18 17,15 V5" />
          <path d="M3,10 Q3,13 10,13 Q17,13 17,10" />
        </svg>
      );
    case "cloud":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw}>
          <circle cx="7"  cy="12" r="4" />
          <circle cx="13" cy="12" r="4" />
          <circle cx="10" cy="8"  r="4" />
          <rect x="5" y="12" width="10" height="4" fill="white" stroke="none" />
          <line x1="5" y1="16" x2="15" y2="16" stroke="currentColor" strokeWidth={sw} />
        </svg>
      );
    case "actor":
      return (
        <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
          <circle cx="10" cy="4" r="3" />
          <line x1="10" y1="7" x2="10" y2="13" />
          <line x1="5"  y1="9" x2="15" y2="9" />
          <line x1="10" y1="13" x2="6"  y2="19" />
          <line x1="10" y1="13" x2="14" y2="19" />
        </svg>
      );
  }
}

export const SHAPE_LABELS: Record<ShapeType, string> = {
  rect:     "Rectangle",
  circle:   "Circle",
  diamond:  "Diamond",
  database: "Database",
  cloud:    "Cloud",
  actor:    "Actor",
};
