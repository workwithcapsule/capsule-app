"use client";

import { CaretDown } from "@phosphor-icons/react";
import { COMPONENT_ICONS, ComponentIcon, ICON_KEYS } from "@/components/component-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMPONENT_COLORS, COMPONENT_COLOR_CLASSES, type ComponentColor } from "@/lib/design";
import { cn } from "@/lib/utils";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const pickButton =
  "group inline-flex h-[30px] flex-none items-center gap-0.5 rounded-full border border-transparent pr-1 pl-[5px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface data-[state=open]:border-border-strong data-[state=open]:bg-surface";

/** A swatch: the color's background with a soft ring of its text color. */
function Swatch({ color, className }: { color: ComponentColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-full", COMPONENT_COLOR_CLASSES[color].tag, className)}
      style={{ boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, currentColor 35%, transparent)" }}
    />
  );
}

/** The two pickers used for a component in onboarding (and later in Settings). */
export function ColorIconPicker({
  name,
  color,
  icon,
  onColor,
  onIcon,
}: {
  name: string;
  color: ComponentColor;
  icon: string;
  onColor: (c: ComponentColor) => void;
  onIcon: (i: string) => void;
}) {
  const label = name.trim() || "this component";
  return (
    <span className="flex flex-none items-center gap-1">
      <Popover>
        <PopoverTrigger
          className={pickButton}
          title="Change color"
          aria-label={`Change color for ${label}, ${cap(color)}`}
        >
          <Swatch color={color} className="size-5" />
          <CaretDown size={10} className="opacity-45 group-hover:opacity-100" />
        </PopoverTrigger>
        <PopoverContent className="w-[236px]" aria-label={`Color for ${label}`}>
          <p className="pb-2 text-xs font-medium text-muted-foreground">Color</p>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {COMPONENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={cap(c)}
                title={cap(c)}
                onClick={() => onColor(c)}
                className={cn(
                  "rounded-full border-2 p-0",
                  c === color ? "border-foreground" : "border-transparent",
                )}
              >
                <Swatch color={c} className="size-[22px]" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger
          className={pickButton}
          title="Change icon"
          aria-label={`Change icon for ${label}, ${COMPONENT_ICONS[icon]?.label ?? "Box"}`}
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full",
              COMPONENT_COLOR_CLASSES[color].tag,
            )}
          >
            <ComponentIcon icon={icon} size={12} />
          </span>
          <CaretDown size={10} className="opacity-45 group-hover:opacity-100" />
        </PopoverTrigger>
        <PopoverContent className="w-[236px]" aria-label={`Icon for ${label}`}>
          <p className="pb-2 text-xs font-medium text-muted-foreground">Icon</p>
          <div role="radiogroup" className="grid grid-cols-6 gap-1">
            {ICON_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === icon}
                aria-label={COMPONENT_ICONS[k].label}
                title={COMPONENT_ICONS[k].label}
                onClick={() => onIcon(k)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg border",
                  COMPONENT_COLOR_CLASSES[color].text,
                  k === icon
                    ? "border-border-strong bg-subtle"
                    : "border-transparent hover:bg-subtle",
                )}
              >
                <ComponentIcon icon={k} size={16} />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
