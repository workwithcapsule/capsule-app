import * as React from "react";
import { cn } from "@/lib/utils";

/** Text field from the prototype (.input): 40px, rounded, red border when invalid. */
function Input({
  className,
  size = "md",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: "md" | "sm" }) {
  return (
    <input
      data-slot="input"
      className={cn(
        "w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-faint focus:border-control focus-visible:outline-none aria-[invalid=true]:border-c-red-fg",
        size === "md" ? "h-10" : "h-8 rounded-lg px-2 text-[13px]",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] leading-[18px] font-medium", className)} {...props} />;
}

/** A field's error message, announced to screen readers. */
function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <span id={id} role="alert" className="text-xs leading-4 text-c-red-fg">
      {children}
    </span>
  );
}

export { Input, Label, FieldError };
