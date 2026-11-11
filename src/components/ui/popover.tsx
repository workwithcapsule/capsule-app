"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** shadcn/ui popover, styled like the prototype's .pop. */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[80] rounded-xl border border-border bg-pop p-2.5 text-foreground shadow-pop outline-none",
          "data-[state=open]:animate-in data-[state=open]:duration-[140ms] data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
          "motion-reduce:data-[state=open]:animate-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
