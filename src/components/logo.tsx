import { cn } from "@/lib/utils";

/**
 * The Capsule mark ("Two worlds": a solid crescent and an outlined circle),
 * from the logo pack. It's one color and follows the text color, so it turns
 * cream in dark mode. `width` sets its size; the height follows (78 × 60).
 */
export function CapsuleMark({ width = 20, className }: { width?: number; className?: string }) {
  return (
    <svg
      viewBox="12 20 78 60"
      width={width}
      height={(width * 60) / 78}
      aria-hidden="true"
      className={cn("flex-none", className)}
    >
      <g fill="currentColor" stroke="currentColor">
        <path stroke="none" d="M50 25.26 A26 26 0 1 0 50 74.74 A26 26 0 0 1 50 25.26 Z" />
        <circle cx="58" cy="50" r="26" fill="none" strokeWidth="5" />
      </g>
    </svg>
  );
}

/** The mark next to the "Capsule" wordmark (sign-in, sign-up and setup screens). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg leading-6 font-semibold tracking-[-0.02em]",
        className,
      )}
    >
      <CapsuleMark width={24} />
      Capsule
    </span>
  );
}
