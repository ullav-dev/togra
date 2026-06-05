"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { VelocityBar } from "@/lib/reports/types";

interface Props {
  bars: VelocityBar[];
  rollingAvg: number[];
}

export default function VelocityChart({ bars, rollingAvg }: Props) {
  if (bars.length === 0) return null;

  const data = bars.map((b, i) => ({ ...b, avg: rollingAvg[i] }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="sprintName"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [v, name === "delivered" ? "Points delivered" : "3-sprint avg"]}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "delivered" ? "Points delivered" : "3-sprint rolling avg"}
        />
        <Bar dataKey="delivered" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3, fill: "#f59e0b" }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
