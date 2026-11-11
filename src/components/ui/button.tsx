import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/** Buttons from the prototype: pill-shaped, quiet colors, no brand accent. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-medium whitespace-nowrap no-underline transition-[background-color,border-color] duration-[120ms] ease-out disabled:cursor-default disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-foreground hover:border-primary-hover hover:bg-primary-hover",
        secondary:
          "border-border bg-surface text-foreground hover:border-border-strong hover:bg-bg",
        quiet: "text-muted-foreground hover:bg-subtle hover:text-foreground",
        link: "h-auto border-none bg-transparent p-0 font-semibold text-foreground underline underline-offset-[3px]",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px]",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-[18px] text-sm",
        icon: "size-8 p-0 text-muted-foreground hover:text-foreground",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto p-0" }],
    defaultVariants: { variant: "secondary", size: "sm" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: props.type ?? "button" })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
