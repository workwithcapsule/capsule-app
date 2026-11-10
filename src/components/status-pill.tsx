import {
  COMPONENT_COLOR_CLASSES,
  STATUS_META,
  type ComponentColor,
  type Status,
} from "@/lib/design";
import { cn } from "@/lib/utils";

/** A status pill shows the word only: no dot, no icon. */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        COMPONENT_COLOR_CLASSES[meta.color].tag,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/** A component label, such as Tech or Sales, in its color. */
export function ComponentTag({
  name,
  color,
  className,
}: {
  name: string;
  color: ComponentColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center rounded-md px-[7px] text-xs leading-5 font-medium whitespace-nowrap",
        COMPONENT_COLOR_CLASSES[color].tag,
        className,
      )}
    >
      {name}
    </span>
  );
}
