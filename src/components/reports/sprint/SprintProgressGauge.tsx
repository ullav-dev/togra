"use client";

import type { SprintProgressData } from "@/lib/reports/types";

interface Props {
  data: SprintProgressData;
}

const GAUGE_CX = 100;
const GAUGE_CY = 95;
const GAUGE_R = 70;
const START_DEG = 225;
const SWEEP_DEG = 270;
const STROKE_WIDTH = 14;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const LIGHT_COLOUR = { green: "#16a34a", amber: "#d97706", red: "#dc2626" } as const;
const TRACK_COLOUR = "#e2e8f0";

export default function SprintProgressGauge({ data }: Props) {
  const { pctDone, totalPoints, donePoints, daysRemaining, trafficLight, daysTotal } = data;
  const fillDeg = (pctDone / 100) * SWEEP_DEG;
  const colour = LIGHT_COLOUR[trafficLight];

  const bgPath = describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG, START_DEG + SWEEP_DEG);
  const fillPath = fillDeg > 0.5
    ? describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG, START_DEG + fillDeg)
    : null;

  // End cap dots
  const startPt = polar(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG);
  const endPt   = polar(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG + SWEEP_DEG);
  const fillEndPt = fillDeg > 0.5
    ? polar(GAUGE_CX, GAUGE_CY, GAUGE_R, START_DEG + fillDeg)
    : null;

  const daysElapsed = daysTotal - daysRemaining;
  const sprintPct = daysTotal > 0 ? Math.round((daysElapsed / daysTotal) * 100) : 0;

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="0 0 200 165" className="w-full max-w-[260px]" aria-label={`Sprint ${pctDone}% complete`}>
        {/* Track */}
        <path
          d={bgPath}
          fill="none"
          stroke={TRACK_COLOUR}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        {/* Fill */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={colour}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
        )}

        {/* Track end caps */}
        <circle cx={startPt.x.toFixed(2)} cy={startPt.y.toFixed(2)} r={STROKE_WIDTH / 2} fill={TRACK_COLOUR} />
        <circle cx={endPt.x.toFixed(2)}   cy={endPt.y.toFixed(2)}   r={STROKE_WIDTH / 2} fill={TRACK_COLOUR} />

        {/* Fill end cap */}
        {fillEndPt && (
          <circle cx={fillEndPt.x.toFixed(2)} cy={fillEndPt.y.toFixed(2)} r={STROKE_WIDTH / 2} fill={colour} />
        )}

        {/* Centre: percentage */}
        <text
          x={GAUGE_CX}
          y={GAUGE_CY - 8}
          textAnchor="middle"
          fontSize="30"
          fontWeight="700"
          fill={colour}
        >
          {pctDone}%
        </text>

        {/* Centre: points */}
        <text x={GAUGE_CX} y={GAUGE_CY + 14} textAnchor="middle" fontSize="11" fill="#64748b">
          {donePoints} / {totalPoints} pts
        </text>

        {/* Days remaining label */}
        <text x={GAUGE_CX} y={152} textAnchor="middle" fontSize="11" fill="#94a3b8">
          {daysRemaining === 0
            ? "Sprint ended"
            : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`}
        </text>
      </svg>

      {/* Sprint pace indicator */}
      <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
        <span>Day {daysElapsed} of {daysTotal}</span>
        <span
          className="px-2 py-0.5 rounded-full font-medium text-white text-xs"
          style={{ background: colour }}
        >
          {trafficLight === "green" ? "On track" : trafficLight === "amber" ? "At risk" : "Behind"}
        </span>
        <span>Expected {sprintPct}%</span>
      </div>
    </div>
  );
}
