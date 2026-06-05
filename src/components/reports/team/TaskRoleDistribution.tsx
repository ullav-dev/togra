"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { RoleSlice } from "@/lib/reports/types";

interface Props { data: RoleSlice[] }

const COLOURS = ["#7c3aed","#a78bfa","#c4b5fd","#ddd6fe","#ede9fe","#f5f3ff","#8b5cf6","#6d28d9"];

export default function TaskRoleDistribution({ data }: Props) {
  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="65%"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v) => [
            `${v} task${Number(v) !== 1 ? "s" : ""} (${total > 0 ? Math.round((Number(v) / total) * 100) : 0}%)`,
            "Open tasks",
          ]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(v: string) => v.length > 16 ? v.slice(0, 16) + "…" : v}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
