"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { FunnelStep } from "@/lib/reports/types";

interface Props { data: FunnelStep[] }

export default function WorkflowFunnel({ data }: Props) {
  if (data.length === 0) return null;

  // Sort by entered descending to read as a funnel from left to right
  const sorted = [...data].sort((a, b) => b.entered - a.entered);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={sorted} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="stepName"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [v, name === "entered" ? "Entered step" : "Completed step"]}
        />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "entered" ? "Entered" : "Completed"} />
        <Bar dataKey="entered"   fill="#c4b5fd" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="completed" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
