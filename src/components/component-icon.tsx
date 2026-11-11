import type { Icon, IconProps } from "@phosphor-icons/react";
import {
  ArrowsClockwise,
  BookOpen,
  Bug,
  ChartLineUp,
  ChatCircle,
  Code,
  Cube,
  Flag,
  Globe,
  Headset,
  Megaphone,
  PenNib,
  Scales,
  ShieldCheck,
  Star,
  Users,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";

/**
 * The icons a component can have (same set and labels as the prototype).
 * The key is what's stored in component_types.icon.
 */
export const COMPONENT_ICONS: Record<string, { label: string; Icon: Icon }> = {
  code: { label: "Code", Icon: Code },
  cycle: { label: "Process", Icon: ArrowsClockwise },
  chart: { label: "Growth", Icon: ChartLineUp },
  megaphone: { label: "Megaphone", Icon: Megaphone },
  headset: { label: "Headset", Icon: Headset },
  shield: { label: "Shield", Icon: ShieldCheck },
  scale: { label: "Scale", Icon: Scales },
  pen: { label: "Pen", Icon: PenNib },
  wallet: { label: "Wallet", Icon: Wallet },
  bug: { label: "Bug", Icon: Bug },
  book: { label: "Book", Icon: BookOpen },
  globe: { label: "Globe", Icon: Globe },
  chat: { label: "Chat", Icon: ChatCircle },
  star: { label: "Star", Icon: Star },
  box: { label: "Box", Icon: Cube },
  people: { label: "People", Icon: Users },
  flag: { label: "Flag", Icon: Flag },
};

export const ICON_KEYS = Object.keys(COMPONENT_ICONS);

export function ComponentIcon({ icon, ...props }: { icon: string | null | undefined } & IconProps) {
  const { Icon } = COMPONENT_ICONS[icon ?? "box"] ?? COMPONENT_ICONS.box;
  return <Icon aria-hidden="true" {...props} />;
}
