import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/**
 * A plain dropdown with our own arrow, 12px in from the right edge (the
 * browser's arrow sits against the border and looks different in each
 * browser). `className` sizes the box; `wrapperClassName` places it.
 */
export function NativeSelect({
  className,
  wrapperClassName,
  prefix,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  wrapperClassName?: string;
  /** A muted word before the value, like "Sort:" (prototype). */
  prefix?: string;
}) {
  return (
    <span className={cn("relative inline-flex", wrapperClassName)}>
      {prefix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 z-[1] -translate-y-1/2 text-sm text-muted-foreground"
        >
          {prefix}
        </span>
      )}
      <select
        {...props}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-[10px] border border-border bg-surface pr-9 pl-2.5 text-sm text-foreground outline-none focus:border-control",
          prefix && "pl-[46px]",
          className,
        )}
      >
        {children}
      </select>
      <CaretDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
