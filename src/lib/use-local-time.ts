"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * The browser's local date ("2026-11-14") and hour, or null while rendering
 * on the server (which doesn't know the person's time zone). Use for "today"
 * and "Good morning" so server and browser never disagree.
 */
export function useLocalTime(): { day: string; hour: number } | null {
  const snap = useSyncExternalStore(
    noop,
    () => {
      const d = new Date();
      return `${localDay(d)}|${d.getHours()}`;
    },
    () => null,
  );
  if (!snap) return null;
  const [day, hour] = snap.split("|");
  return { day, hour: Number(hour) };
}

export function localDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
