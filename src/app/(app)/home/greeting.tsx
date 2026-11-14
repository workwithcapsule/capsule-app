"use client";

import { useLocalTime } from "@/lib/use-local-time";

/** "Good morning, Christina", by the browser's own clock. */
export function Greeting({ name }: { name: string }) {
  const local = useLocalTime();
  const first = name.trim().split(/\s+/)[0] || name;
  const part = !local
    ? "Hello"
    : local.hour < 5
      ? "Good evening"
      : local.hour < 12
        ? "Good morning"
        : local.hour < 18
          ? "Good afternoon"
          : "Good evening";
  return (
    <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
      {part}, {first}
    </h1>
  );
}
