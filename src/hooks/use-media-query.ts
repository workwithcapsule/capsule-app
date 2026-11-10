"use client";

import { useSyncExternalStore } from "react";

/** True when the media query matches. Always false during server rendering. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const WIDE = "(min-width: 1280px)";
export const LAPTOP_UP = "(min-width: 900px)";
