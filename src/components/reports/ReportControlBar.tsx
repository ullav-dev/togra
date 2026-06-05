"use client";

import { useTranslations } from "next-intl";
import type { Job, ReportInterval } from "@/lib/types";

interface Props {
  sprints: Job[];
  selectedSprintId: string | "all";
  onSprintChange: (id: string | "all") => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  isLive: boolean;
  onToggleLive: () => void;
  refreshInterval: ReportInterval;
  onRefreshIntervalChange: (v: ReportInterval) => void;
  onManageDashboard: () => void;
}

const INTERVALS: { value: ReportInterval; labelKey: string }[] = [
  { value: 30,  labelKey: "controls.interval30s" },
  { value: 60,  labelKey: "controls.interval1m"  },
  { value: 300, labelKey: "controls.interval5m"  },
  { value: 900, labelKey: "controls.interval15m" },
];

export default function ReportControlBar({
  sprints, selectedSprintId, onSprintChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  isLive, onToggleLive, refreshInterval, onRefreshIntervalChange,
  onManageDashboard,
}: Props) {
  const t = useTranslations("reports");

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-3 shrink-0">
      {/* Sprint selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500 whitespace-nowrap">
          {t("controls.sprintLabel")}
        </label>
        <select
          value={selectedSprintId}
          onChange={(e) => onSprintChange(e.target.value as string | "all")}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">{t("controls.allSprints")}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500">{t("controls.dateFrom")}</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <label className="text-xs font-medium text-slate-500">{t("controls.dateTo")}</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Live toggle */}
      <button
        type="button"
        onClick={onToggleLive}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          isLive
            ? "bg-violet-600 text-white hover:bg-violet-700"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
        aria-pressed={isLive}
      >
        <span className={`w-2 h-2 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-slate-400"}`} />
        {t("controls.live")}
      </button>

      {/* Refresh interval (only when live) */}
      {isLive && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">{t("controls.refreshInterval")}</label>
          <select
            value={refreshInterval}
            onChange={(e) => onRefreshIntervalChange(Number(e.target.value) as ReportInterval)}
            className="text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {INTERVALS.map(({ value, labelKey }) => (
              <option key={value} value={value}>{t(labelKey)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Manage dashboard */}
      <button
        type="button"
        onClick={onManageDashboard}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        {t("controls.manageDashboard")}
      </button>
    </div>
  );
}
