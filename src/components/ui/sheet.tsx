"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui sheet (a panel that slides in from the left), used for the
 * sidebar on laptop and narrow widths. Motion matches the prototype:
 * a short slide and fade, skipped with reduced motion.
 */

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={className} {...props} />;
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className={cn(
          "fixed inset-0 z-[69] bg-scrim",
          "data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0",
          "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
        )}
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-[70] flex h-dvh w-[272px] max-w-[86vw] flex-col overflow-y-auto border-r border-border bg-bg shadow-drawer outline-none",
          "data-[state=open]:animate-in data-[state=open]:duration-[220ms] data-[state=open]:ease-capsule data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-7",
          "data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-7",
          "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetContent, SheetTitle };
