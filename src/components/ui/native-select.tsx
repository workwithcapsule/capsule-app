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
  children,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <span className={cn("relative inline-flex", wrapperClassName)}>
      <select
        {...props}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-[10px] border border-border bg-surface pr-9 pl-2.5 text-sm text-foreground outline-none focus:border-control",
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
