"use client";

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { CycleTimeData } from "@/lib/reports/types";

interface Props { data: CycleTimeData }

export default function CycleTimeScatter({ data }: Props) {
  if (data.points.length === 0) return null;

  // Map to recharts scatter format (x = unix ms for axis, y = cycle time)
  const plotData = data.points.map((p) => ({
    x: new Date(p.completedAt).getTime(),
    y: p.cycleTimeDays,
    name: p.taskName,
    story: p.workflowName,
  }));

  const xMin = Math.min(...plotData.map((d) => d.x));
  const xMax = Math.max(...plotData.map((d) => d.x));

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={200}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[xMin - 86400000, xMax + 86400000]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => fmtDate(v)}
            tickCount={6}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Days"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            label={{ value: "days", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8", dy: 20 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(v, name) => [
              name === "y" ? `${v} days` : v,
              name === "y" ? "Cycle time" : String(name),
            ]}
          />
          {/* Percentile reference lines */}
          <ReferenceLine y={data.p50} stroke="#16a34a" strokeDasharray="4 3"
            label={{ value: `p50 ${data.p50}d`, position: "insideTopRight", fontSize: 9, fill: "#16a34a" }} />
          <ReferenceLine y={data.p85} stroke="#f59e0b" strokeDasharray="4 3"
            label={{ value: `p85 ${data.p85}d`, position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
          <ReferenceLine y={data.p95} stroke="#dc2626" strokeDasharray="4 3"
            label={{ value: `p95 ${data.p95}d`, position: "insideTopRight", fontSize: 9, fill: "#dc2626" }} />
          <Scatter data={plotData} fill="#7c3aed" fillOpacity={0.7} r={4} />
        </ScatterChart>
      </ResponsiveContainer>
      {/* Percentile legend */}
      <div className="flex gap-4 mt-1 justify-center text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-600 inline-block" />p50 {data.p50}d</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" />p85 {data.p85}d</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-600 inline-block"  />p95 {data.p95}d</span>
      </div>
    </div>
  );
}
