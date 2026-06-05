"use client";

import type { IdeasFunnelData } from "@/lib/reports/types";

interface Props { data: IdeasFunnelData }

export default function IdeasFunnel({ data }: Props) {
  const steps = [
    { label: "Ideas created",    value: data.created,   colour: "#ede9fe", text: "#5b21b6" },
    { label: "Promoted to story",value: data.promoted,  colour: "#ddd6fe", text: "#6d28d9" },
    { label: "Story completed",  value: data.completed, colour: "#7c3aed", text: "#ffffff" },
  ];

  const max = Math.max(data.created, 1);

  return (
    <div className="w-full flex flex-col items-center gap-3 py-2">
      {steps.map((step, i) => {
        const widthPct = Math.max(20, Math.round((step.value / max) * 100));
        const convRate = i > 0 && steps[i - 1].value > 0
          ? Math.round((step.value / steps[i - 1].value) * 100)
          : null;
        return (
          <div key={step.label} className="w-full flex flex-col items-center gap-1">
            {convRate !== null && (
              <span className="text-xs text-slate-400">↓ {convRate}% conversion</span>
            )}
            <div className="w-full flex justify-center">
              <div
                className="flex items-center justify-center rounded-lg py-3 font-semibold text-sm transition-all"
                style={{ width: `${widthPct}%`, background: step.colour, color: step.text, minWidth: 120 }}
              >
                <span className="text-lg font-bold mr-2">{step.value}</span>
                <span className="text-xs font-normal opacity-80">{step.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
