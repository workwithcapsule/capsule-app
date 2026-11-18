import type { ComponentColor } from "@/lib/design";

export type SettingsComponent = {
  id?: string;
  key: string;
  name: string;
  description: string;
  color: ComponentColor;
  icon: string;
};

/** An AI app the person connected to Capsule (Settings → Connected apps, step 13). */
export type ConnectedApp = {
  clientId: string;
  name: string;
  connectedAt: string;
  lastUsedAt: string | null;
};
