"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "togra_kanban_refresh_mode";
const DEFAULT_INTERVAL_MS = 30_000;

interface Props {
  onRefresh: () => Promise<void>;
  intervalMs?: number;
}

export default function RefreshControl({ onRefresh, intervalMs = DEFAULT_INTERVAL_MS }: Props) {
  const [mode, setMode] = useState<"auto" | "manual">(() => {
    if (typeof window === "undefined") return "auto";
    return (localStorage.getItem(STORAGE_KEY) as "auto" | "manual") ?? "auto";
  });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [countdown, setCountdown] = useState(Math.floor(intervalMs / 1000));
  const countdownRef = useRef(countdown);
  countdownRef.current = countdown;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const doRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setLastRefreshed(new Date());
    } finally {
      setRefreshing(false);
      setCountdown(Math.floor(intervalMs / 1000));
    }
  }, [onRefresh, refreshing, intervalMs]);

  // Auto-refresh countdown tick; pauses while the tab is hidden, resumes on return
  useEffect(() => {
    if (mode !== "auto") return;

    let id: ReturnType<typeof setInterval> | null = null;

    function startInterval() {
      id = setInterval(() => {
        if (document.hidden) return; // skip ticks while hidden
        setCountdown((prev) => {
          if (prev <= 1) {
            setTimeout(() => {
              if (modeRef.current === "auto") void doRefresh();
            }, 0);
            return Math.floor(intervalMs / 1000);
          }
          return prev - 1;
        });
      }, 1000);
    }

    function handleVisibility() {
      if (document.hidden) {
        if (id !== null) { clearInterval(id); id = null; }
      } else {
        if (id === null) startInterval();
      }
    }

    startInterval();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (id !== null) clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mode, doRefresh, intervalMs]);

  // "X ago" display
  const secondsAgo = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);
  const agoLabel =
    secondsAgo < 5 ? "just now" :
    secondsAgo < 60 ? `${secondsAgo}s ago` :
    `${Math.floor(secondsAgo / 60)}m ago`;

  function toggleMode() {
    const next = mode === "auto" ? "manual" : "auto";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (next === "auto") setCountdown(Math.floor(intervalMs / 1000));
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className="text-slate-400">Last updated: {agoLabel}</span>

      {mode === "auto" && (
        <span className="tabular-nums text-slate-400">{countdown}s</span>
      )}

      <button
        type="button"
        onClick={doRefresh}
        disabled={refreshing}
        title="Refresh now"
        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-violet-700 transition-colors disabled:opacity-40"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
        >
          <path d="M1.705 8a6.3 6.3 0 0 1 6.3-6.3 6.3 6.3 0 0 1 4.45 1.845L10.5 5.5H14V2l-1.42 1.42A7.8 7.8 0 0 0 8 1.2 6.8 6.8 0 1 0 14.8 8h-1.5A5.3 5.3 0 1 1 8 2.7 5.3 5.3 0 0 1 8 2.7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={toggleMode}
        title={mode === "auto" ? "Switch to manual refresh" : "Switch to auto-refresh"}
        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
          mode === "auto"
            ? "bg-teal-100 text-teal-700 hover:bg-teal-200"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {mode === "auto" ? "Auto" : "Manual"}
      </button>
    </div>
  );
}
