"use client";

/**
 * AppUrlsContext — runtime app URL configuration for the togra nav.
 *
 * URLs are read server-side from plain process.env vars (no NEXT_PUBLIC_ prefix)
 * in the locale layout, then passed to this provider as serialisable props.
 * This allows the same Docker image to serve both staging and production without
 * baking URLs at build time.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type AppUrls = {
  /** External URL of awe-client (Obair) — empty string hides the nav link */
  obairUrl: string;
  /** External URL of ullav-dam-browser (Comad) — empty string hides the nav link */
  damBrowserUrl: string;
};

const defaultUrls: AppUrls = {
  obairUrl: "",
  damBrowserUrl: "",
};

const AppUrlsContext = createContext<AppUrls>(defaultUrls);

export function AppUrlsProvider({
  urls,
  children,
}: {
  urls: AppUrls;
  children: ReactNode;
}) {
  return (
    <AppUrlsContext.Provider value={urls}>{children}</AppUrlsContext.Provider>
  );
}

export function useAppUrls(): AppUrls {
  return useContext(AppUrlsContext);
}
