import type { ComponentColor, Status } from "@/lib/design";

/** Shapes shared by the capsule page (server) and its interactive parts (browser). */

export type PersonRef = { id: string; name: string; initials: string };

export type WorkItem = {
  id: string;
  componentId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  createdBy: string | null;
  position: number;
};

export type CapsuleComponent = {
  id: string;
  typeId: string;
  name: string;
  color: ComponentColor;
  icon: string | null;
  ownerId: string | null;
  dueDate: string | null;
  status: Status;
  goal: string | null;
  position: number;
  collaborators: { userId: string; source: "added" | "assignment" }[];
};

export type ComponentType = {
  id: string;
  name: string;
  color: ComponentColor;
  icon: string | null;
  description: string | null;
};

export type Capsule = {
  id: string;
  orgId: string;
  key: string;
  name: string;
  outcome: string | null;
  status: Status;
  launchDate: string | null;
  dateType: "launch" | "due";
  ownerId: string | null;
  space: { id: string; name: string; keyPrefix: string };
};

export type CapsuleData = {
  capsule: Capsule;
  components: CapsuleComponent[];
  items: WorkItem[];
  people: PersonRef[];
  componentTypes: ComponentType[];
  me: PersonRef;
};

/** Mirrors the database's rules, so the page only shows what each person can change. */
export function permissionsFor(data: Pick<CapsuleData, "capsule" | "components" | "me">) {
  const me = data.me.id;
  const isOwner = data.capsule.ownerId === me;
  const onTeam =
    isOwner ||
    data.components.some((c) => c.ownerId === me || c.collaborators.some((p) => p.userId === me));
  const compById = new Map(data.components.map((c) => [c.id, c]));
  const ownsComponent = (componentId: string) => compById.get(componentId)?.ownerId === me;
  const editComponent = (componentId: string) => isOwner || ownsComponent(componentId);
  return {
    isOwner,
    onTeam,
    editComponent,
    completeItem: (i: WorkItem) => onTeam && (editComponent(i.componentId) || i.assigneeId === me),
    renameItem: (i: WorkItem) =>
      onTeam && (editComponent(i.componentId) || i.assigneeId === me || i.createdBy === me),
    deleteItem: (i: WorkItem) => onTeam && (editComponent(i.componentId) || i.createdBy === me),
    /** Anyone on the team may take an unassigned item or let go of their own. */
    assignOptions: (i: WorkItem): "anyone" | "self" | "none" =>
      !onTeam
        ? "none"
        : editComponent(i.componentId)
          ? "anyone"
          : !i.assigneeId || i.assigneeId === me
            ? "self"
            : "none",
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;
