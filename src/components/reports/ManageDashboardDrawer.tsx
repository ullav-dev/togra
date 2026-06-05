"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DashboardConfig, ReportId, PresetId } from "@/lib/types";
import { REPORT_CATALOG, PRESETS, REPORT_CATEGORIES, type ReportCategory } from "@/lib/reports/catalog";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props {
  config: DashboardConfig;
  onToggleReport: (id: ReportId, enabled: boolean) => void;
  onApplyPreset: (presetId: PresetId) => void;
  onClose: () => void;
}

const PRESET_IDS: PresetId[] = ["sprint_overview", "flow_health", "process_insights", "team_capacity", "ideas_pipeline", "live_sprint_room"];

export default function ManageDashboardDrawer({ config, onToggleReport, onApplyPreset, onClose }: Props) {
  const t = useTranslations("reports");
  const [pendingPreset, setPendingPreset] = useState<PresetId | null>(null);

  const enabledSet = new Set(config.enabledReportIds);

  const handlePresetClick = (presetId: PresetId) => {
    setPendingPreset(presetId);
  };

  const handleConfirmPreset = () => {
    if (pendingPreset) {
      onApplyPreset(pendingPreset);
      setPendingPreset(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-40 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-slate-800">{t("drawer.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={t("drawer.close")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Presets section */}
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {t("drawer.presetsHeading")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_IDS.map((presetId) => (
                <button
                  key={presetId}
                  type="button"
                  onClick={() => handlePresetClick(presetId)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    config.presetId === presetId
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {t(`presets.${presetId}`)}
                  <span className="block text-slate-400 font-normal mt-0.5">
                    {PRESETS[presetId].length} {t("drawer.reportsCount")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Catalog section */}
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {t("drawer.catalogHeading")}
            </h3>
            {REPORT_CATEGORIES.map((category) => {
              const reports = REPORT_CATALOG.filter((r) => r.category === category);
              return (
                <div key={category} className="mb-5">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    {t(`drawer.categories.${category}`)}
                  </h4>
                  <div className="space-y-1">
                    {reports.map((report) => (
                      <label
                        key={report.id}
                        className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={enabledSet.has(report.id)}
                          onChange={(e) => onToggleReport(report.id, e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 shrink-0"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                            {t(`catalog.${report.id}.title`)}
                          </span>
                          <span className="block text-xs text-slate-400 mt-0.5">
                            {t(`catalog.${report.id}.description`)}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pendingPreset && (
        <ConfirmDialog
          title={t("drawer.applyPresetConfirmLabel")}
          message={t("drawer.applyPresetConfirm", { name: t(`presets.${pendingPreset}`) })}
          confirmLabel={t("drawer.applyPreset")}
          onConfirm={handleConfirmPreset}
          onCancel={() => setPendingPreset(null)}
        />
      )}
    </>
  );
}
