import type { ComponentColor } from "@/lib/design";

export type OnboardingComponent = {
  /** Database id once saved. */
  id?: string;
  /** Stable key for the list while editing. */
  key: string;
  name: string;
  description: string;
  color: ComponentColor;
  icon: string;
};

export type OnboardingSpace = { id?: string; key: string; name: string; prefix: string };

export type OnboardingState = {
  email: string;
  yourName: string;
  org: { id: string; name: string; step: number } | null;
  components: OnboardingComponent[];
  spaces: OnboardingSpace[];
  invites: string[];
  /** Jira linking (step 14): set up on this server, and whether you've connected. */
  jira: { configured: boolean; connected: boolean };
};

export type ActionResult = { ok: true } | { ok: false; error: string };
