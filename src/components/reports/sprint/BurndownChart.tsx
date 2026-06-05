"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { BurndownPoint } from "@/lib/reports/types";

interface Props { data: BurndownPoint[] }

export default function BurndownChart({ data }: Props) {
  if (data.length === 0) return null;

  // X-axis: show every ~3rd label to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 6));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval={step - 1}
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [v, name === "remaining" ? "Remaining pts" : "Ideal"]}
          labelFormatter={(l) => String(l)}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "remaining" ? "Actual remaining" : "Ideal"}
        />
        <Line
          type="monotone"
          dataKey="ideal"
          stroke="#cbd5e1"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
          activeDot={false}
        />
        <Line
          type="monotone"
          dataKey="remaining"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {/* Zero line */}
        <ReferenceLine y={0} stroke="#e2e8f0" />
      </LineChart>
    </ResponsiveContainer>
  );
}
