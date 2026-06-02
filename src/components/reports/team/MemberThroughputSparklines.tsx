"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import type { MemberSparkline } from "@/lib/reports/types";

interface Props { data: MemberSparkline[] }

function Sparkline({ sparkline }: { sparkline: MemberSparkline }) {
  const total = sparkline.points.reduce((s, p) => s + p.count, 0);
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0">
        <p className="text-xs font-medium text-slate-700 truncate" title={sparkline.memberName}>
          {sparkline.memberName.split(" ")[0]}
        </p>
        <p className="text-xs text-slate-400">{total} total</p>
      </div>
      <div className="flex-1 h-10">
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={sparkline.points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="count"
              stroke="#7c3aed"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e2e8f0", padding: "2px 8px" }}
              formatter={(v) => [v, "Tasks"]}
              labelFormatter={(l) => `w/c ${l}`}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function MemberThroughputSparklines({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <div className="w-full space-y-3 divide-y divide-slate-50">
      {data.map((s) => (
        <div key={s.memberId} className="pt-2 first:pt-0">
          <Sparkline sparkline={s} />
        </div>
      ))}
    </div>
  );
}
