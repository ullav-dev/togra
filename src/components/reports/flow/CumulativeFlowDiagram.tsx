"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { CfdPoint } from "@/lib/reports/types";

interface Props { data: CfdPoint[] }

// Status colours aligned with StatusPill conventions
const STATUS_CONFIG = [
  { key: "Not Started", colour: "#e2e8f0" },
  { key: "Ready",       colour: "#bfdbfe" },
  { key: "In Progress", colour: "#7c3aed" },
  { key: "On Hold",     colour: "#fde68a" },
  { key: "Complete",    colour: "#bbf7d0" },
  { key: "Cancelled",   colour: "#fecaca" },
] as const;

const step = (len: number) => Math.max(1, Math.floor(len / 6));

export default function CumulativeFlowDiagram({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval={step(data.length) - 1}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          labelFormatter={(l) => String(l)}
        />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
        {STATUS_CONFIG.map(({ key, colour }) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stackId="1"
            stroke={colour}
            fill={colour}
            fillOpacity={0.85}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
