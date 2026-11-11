import type { ComponentColor } from "@/lib/design";

export type JoinComponent = {
  id: string;
  name: string;
  color: ComponentColor;
  icon: string | null;
};

export type JoinCapsule = {
  id: string;
  name: string;
  /** What this person has on it, e.g. "Sales owner · 2 work items assigned to you". */
  role: string;
  needs: number;
};

export type JoinSpace = {
  id: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  members: number;
  joined: boolean;
  capsules: JoinCapsule[];
};

export type JoinState = {
  /** "invited": hasn't accepted yet (step 1). "joining": accepted, finishing up. */
  stage: "invited" | "joining";
  email: string;
  yourName: string;
  orgId: string | null;
  orgName: string;
  invitedBy: string;
  components: JoinComponent[];
  areas: string[];
  spaces: JoinSpace[];
};
