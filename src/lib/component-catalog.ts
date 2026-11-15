import { COMPONENT_COLORS, type ComponentColor } from "@/lib/design";

/*
 * Components offered as one-click additions, in onboarding and in Settings →
 * Org components (prototype ORG_COMPS).
 */

/** Components offered as one-click additions (prototype ORG_COMPS). */
export const SUGGESTED_COMPONENTS: {
  name: string;
  color: ComponentColor;
  icon: string;
  description: string;
}[] = [
  { name: "Tech", color: "blue", icon: "code", description: "Engineering, QA and release work." },
  {
    name: "Operations",
    color: "teal",
    icon: "cycle",
    description: "Readiness, process and support handoff.",
  },
  {
    name: "Sales",
    color: "green",
    icon: "chart",
    description: "Enablement, training and customer comms.",
  },
  {
    name: "Marketing",
    color: "orange",
    icon: "megaphone",
    description: "Messaging, launch content and campaigns.",
  },
  {
    name: "Support",
    color: "amber",
    icon: "headset",
    description: "Macros, docs and support readiness.",
  },
  { name: "Compliance", color: "purple", icon: "shield", description: "Reviews and sign-offs." },
  { name: "Legal", color: "gray", icon: "scale", description: "Contracts, terms and approvals." },
  { name: "Design", color: "pink", icon: "pen", description: "UX, visuals and research." },
  {
    name: "Finance",
    color: "olive",
    icon: "wallet",
    description: "Budget, pricing and forecasting.",
  },
];

/** Custom components get the next color not already in use. */
export function nextColor(used: ComponentColor[]): ComponentColor {
  return COMPONENT_COLORS.find((c) => !used.includes(c)) ?? "gray";
}
