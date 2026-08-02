"use client";

import * as React from "react";

/**
 * SSR-safe media query. Returns `false` on the server and during the first
 * client render, then syncs — so nothing hydration-mismatches.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}
