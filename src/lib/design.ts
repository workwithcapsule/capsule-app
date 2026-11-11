/**
 * The fixed sets from design-decisions.md section 11.
 * Class names are written out in full so Tailwind can find them.
 */

export const COMPONENT_COLORS = [
  "blue",
  "teal",
  "green",
  "olive",
  "amber",
  "orange",
  "red",
  "pink",
  "purple",
  "gray",
] as const;

export type ComponentColor = (typeof COMPONENT_COLORS)[number];

export const COMPONENT_COLOR_CLASSES: Record<
  ComponentColor,
  { tag: string; dot: string; text: string }
> = {
  blue: { tag: "bg-c-blue text-c-blue-fg", dot: "bg-c-blue-dot", text: "text-c-blue-fg" },
  teal: { tag: "bg-c-teal text-c-teal-fg", dot: "bg-c-teal-dot", text: "text-c-teal-fg" },
  green: { tag: "bg-c-green text-c-green-fg", dot: "bg-c-green-dot", text: "text-c-green-fg" },
  olive: { tag: "bg-c-olive text-c-olive-fg", dot: "bg-c-olive-dot", text: "text-c-olive-fg" },
  amber: { tag: "bg-c-amber text-c-amber-fg", dot: "bg-c-amber-dot", text: "text-c-amber-fg" },
  orange: { tag: "bg-c-orange text-c-orange-fg", dot: "bg-c-orange-dot", text: "text-c-orange-fg" },
  red: { tag: "bg-c-red text-c-red-fg", dot: "bg-c-red-dot", text: "text-c-red-fg" },
  pink: { tag: "bg-c-pink text-c-pink-fg", dot: "bg-c-pink-dot", text: "text-c-pink-fg" },
  purple: { tag: "bg-c-purple text-c-purple-fg", dot: "bg-c-purple-dot", text: "text-c-purple-fg" },
  gray: { tag: "bg-c-gray text-c-gray-fg", dot: "bg-c-gray-dot", text: "text-c-gray-fg" },
};

/** Default colors for well-known components. Custom ones get the next unused color. */
export const DEFAULT_COMPONENT_COLORS: Record<string, ComponentColor> = {
  Tech: "blue",
  Operations: "teal",
  Sales: "green",
  Marketing: "orange",
  Compliance: "purple",
  Support: "amber",
  Legal: "gray",
  Design: "pink",
  Finance: "olive",
};

export const STATUSES = ["not_started", "in_progress", "in_review", "done", "blocked"] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_META: Record<Status, { label: string; color: ComponentColor }> = {
  not_started: { label: "Not Started", color: "gray" },
  in_progress: { label: "In Progress", color: "blue" },
  in_review: { label: "In Review", color: "amber" },
  done: { label: "Done", color: "green" },
  blocked: { label: "Blocked", color: "red" },
};
