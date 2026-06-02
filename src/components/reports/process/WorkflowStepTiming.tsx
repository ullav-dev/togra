"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { StepTimingBar } from "@/lib/reports/types";

interface Props { data: StepTimingBar[] }

export default function WorkflowStepTiming({ data }: Props) {
  if (data.length === 0) return null;

  // Sort by avgDays descending so slowest steps appear at top
  const sorted = [...data].sort((a, b) => b.avgDays - a.avgDays);

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 36 + 40)}>
      <BarChart
        layout="vertical"
        data={sorted}
        margin={{ top: 4, right: 24, bottom: 0, left: 80 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          unit="d"
        />
        <YAxis
          type="category"
          dataKey="stepName"
          tick={{ fontSize: 11, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
          width={78}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [`${v} days`, name === "avgDays" ? "Average" : "p85"]}
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "avgDays" ? "Average" : "p85"} />
        <Bar dataKey="avgDays" fill="#7c3aed" radius={[0, 4, 4, 0]} maxBarSize={18} />
        <Bar dataKey="p85Days" fill="#c4b5fd" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
