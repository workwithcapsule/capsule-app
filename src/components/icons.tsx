import type { IconProps } from "@phosphor-icons/react";
import { Pill } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/** The capsule icon: Phosphor's pill, turned level like the prototype's. */
export function CapsuleIcon({ className, ...props }: IconProps) {
  return <Pill className={cn("rotate-45", className)} {...props} />;
}
