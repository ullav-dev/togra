"use client";

import type { AgingCell } from "@/lib/reports/types";

interface Props { data: AgingCell[] }

function agingColour(days: number): { bg: string; text: string } {
  if (days <= 3)  return { bg: "#f0fdf4", text: "#166534" };
  if (days <= 7)  return { bg: "#fef9c3", text: "#854d0e" };
  if (days <= 14) return { bg: "#fff7ed", text: "#9a3412" };
  return             { bg: "#fef2f2", text: "#991b1b" };
}

export default function StoryAgingHeatmap({ data }: Props) {
  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.daysInCurrentState - a.daysInCurrentState);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="py-1.5 pr-3 font-medium whitespace-nowrap">Story</th>
            <th className="py-1.5 pr-3 font-medium whitespace-nowrap">Step</th>
            <th className="py-1.5 font-medium whitespace-nowrap text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((cell) => {
            const { bg, text } = agingColour(cell.daysInCurrentState);
            return (
              <tr key={cell.workflowId} className="border-b border-slate-50">
                <td className="py-1.5 pr-3 text-slate-700 max-w-[160px] truncate">
                  {cell.workflowName}
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{cell.stepName}</td>
                <td className="py-1.5 text-right">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full font-medium text-xs"
                    style={{ background: bg, color: text }}
                  >
                    {cell.daysInCurrentState}d
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex gap-3 mt-2 text-xs text-slate-400 flex-wrap">
        {[
          { label: "≤3d", bg: "#f0fdf4", text: "#166534" },
          { label: "≤7d", bg: "#fef9c3", text: "#854d0e" },
          { label: "≤14d",bg: "#fff7ed", text: "#9a3412" },
          { label: ">14d",bg: "#fef2f2", text: "#991b1b" },
        ].map(({ label, bg, text }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: bg, border: `1px solid ${text}30` }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
