import type { ComponentColor } from "@/lib/design";

export type SettingsComponent = {
  id?: string;
  key: string;
  name: string;
  description: string;
  color: ComponentColor;
  icon: string;
};
