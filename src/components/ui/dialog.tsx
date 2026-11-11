"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** shadcn/ui dialog, styled with the Stone palette. */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-[75] bg-scrim",
          "data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0",
          "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
        )}
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-[76] flex w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-pop p-6 text-foreground shadow-pop outline-none",
          "data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:ease-capsule data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          "data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0",
          "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          <X size={14} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 text-lg leading-6 font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle };
