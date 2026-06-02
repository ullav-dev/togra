"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ThroughputBar } from "@/lib/reports/types";

interface Props { data: ThroughputBar[] }

export default function ThroughputChart({ data }: Props) {
  if (data.length === 0) return null;

  const avg = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.count, 0) / data.length * 10) / 10
    : 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="weekStart"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v) => [v, "Tasks completed"]}
          labelFormatter={(l) => `Week of ${l}`}
        />
        <ReferenceLine
          y={avg}
          stroke="#f59e0b"
          strokeDasharray="4 3"
          label={{ value: `avg ${avg}`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
        />
        <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
