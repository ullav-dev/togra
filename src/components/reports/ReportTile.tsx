"use client";

import { useTranslations } from "next-intl";

interface Props {
  title: string;
  description?: string;
  isLive: boolean;
  affectedByLive: boolean;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}

export default function ReportTile({ title, description, isLive, affectedByLive, loading, empty, children }: Props) {
  const t = useTranslations("reports");

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        {isLive && !affectedByLive && (
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {t("tile.liveNotApplicable")}
          </span>
        )}
        {isLive && affectedByLive && (
          <span className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            {t("controls.live")}
          </span>
        )}
      </div>

      <div className="flex-1 p-4 min-h-[220px] flex items-center justify-center">
        {loading ? (
          <div className="w-full space-y-3 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-32 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded w-1/2" />
          </div>
        ) : empty ? (
          <p className="text-sm text-slate-400">{t("tile.noData")}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
