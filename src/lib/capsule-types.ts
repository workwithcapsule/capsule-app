import type { ActivityEvent } from "@/lib/activity";
import type { AttentionRow } from "@/lib/attention";
import type { LinkType } from "@/lib/attachments";
import type { ComponentColor, Status } from "@/lib/design";
import type { ItemStatus } from "@/lib/work-items";

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
  /** One of the four work statuses; Done whenever it's checked off. */
  status: ItemStatus;
  /** Set by hand on an item with pieces, so it no longer follows them. */
  statusManual: boolean;
  note: string | null;
};

/** One collaborator's piece of a work item (step 12). */
export type Piece = {
  id: string;
  itemId: string;
  userId: string;
  piece: string;
  status: ItemStatus;
  isLead: boolean;
  createdBy: string | null;
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

export type Attachment = {
  id: string;
  kind: "file" | "link";
  name: string;
  url: string | null;
  storagePath: string | null;
  linkType: LinkType | null;
  sizeBytes: number | null;
  addedBy: string | null;
  createdAt: string;
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
  /** Collaborators' pieces of the work items, oldest first. */
  pieces: Piece[];
  people: PersonRef[];
  componentTypes: ComponentType[];
  me: PersonRef;
  /** Attachments on the capsule (not removed), oldest first. */
  attachments: Attachment[];
  /** Your rows from Needs your attention that are on this capsule ("Needs you here"). */
  needsMe: AttentionRow[];
  /** People following the capsule, and since when (ISO timestamp). */
  followers: { userId: string; since: string }[];
  /** The capsule's activity log, newest first (raw; see lib/activity.ts). */
  activity: ActivityEvent[];
};

/** Mirrors the database's rules, so the page only shows what each person can change. */
export function permissionsFor(
  data: Pick<CapsuleData, "capsule" | "components" | "me"> & { pieces?: Piece[] },
) {
  const me = data.me.id;
  const isOwner = data.capsule.ownerId === me;
  const onTeam =
    isOwner ||
    data.components.some((c) => c.ownerId === me || c.collaborators.some((p) => p.userId === me));
  const compById = new Map(data.components.map((c) => [c.id, c]));
  const ownsComponent = (componentId: string) => compById.get(componentId)?.ownerId === me;
  const editComponent = (componentId: string) => isOwner || ownsComponent(componentId);
  const leads = (i: WorkItem) =>
    (data.pieces ?? []).some((p) => p.itemId === i.id && p.userId === me && p.isLead);
  const manageItem = (i: WorkItem) =>
    onTeam &&
    (editComponent(i.componentId) || i.assigneeId === me || i.createdBy === me || leads(i));
  return {
    isOwner,
    onTeam,
    editComponent,
    /** Check it off or set its status. */
    completeItem: (i: WorkItem) =>
      onTeam && (editComponent(i.componentId) || i.assigneeId === me || leads(i)),
    renameItem: (i: WorkItem) =>
      onTeam &&
      (editComponent(i.componentId) || i.assigneeId === me || i.createdBy === me || leads(i)),
    deleteItem: (i: WorkItem) => onTeam && (editComponent(i.componentId) || i.createdBy === me),
    /** Add and remove collaborators, and pick the lead. */
    manageItem,
    /** Change a piece: its own collaborator, or whoever manages the item. */
    editPiece: (p: Piece, i: WorkItem) => onTeam && (p.userId === me || manageItem(i)),
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
