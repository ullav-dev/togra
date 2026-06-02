"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { TeamLoadBar } from "@/lib/reports/types";

interface Props { data: TeamLoadBar[] }

export default function TeamLoadChart({ data }: Props) {
  if (data.length === 0) return null;

  const filtered = data.filter((d) => d.plannedPoints > 0 || d.deliveredPoints > 0);
  if (filtered.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filtered} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="assigneeName"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => v.split(" ")[0]} // first name only
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [v, name === "plannedPoints" ? "Planned" : "Delivered"]}
        />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "plannedPoints" ? "Planned pts" : "Delivered pts"} />
        <Bar dataKey="plannedPoints"   fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="deliveredPoints" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
