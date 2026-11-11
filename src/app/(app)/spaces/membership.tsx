"use client";

import { useTransition } from "react";
import { Check } from "@phosphor-icons/react";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinSpace, leaveSpace } from "./actions";

export type MembershipState = {
  id: string;
  name: string;
  joined: boolean;
  myRole: "admin" | "member" | null;
};

/**
 * Join and leave with the prototype's toasts and Undo. The change shows at
 * once and is put back if the server says no.
 */
export function useMembership(
  onChange: (id: string, joined: boolean, role: MembershipState["myRole"]) => void,
) {
  const toast = useToast();
  const [pending, start] = useTransition();

  function set(
    space: MembershipState,
    join: boolean,
    role: MembershipState["myRole"],
    withUndo: boolean,
  ) {
    const previousRole = space.myRole;
    onChange(space.id, join, join ? (role ?? "member") : null);
    start(async () => {
      const r = join ? await joinSpace(space.id, role ?? "member") : await leaveSpace(space.id);
      if (!r.ok) {
        onChange(space.id, !join, previousRole);
        toast(r.error);
        return;
      }
      if (!withUndo) return;
      const undo = () =>
        set({ ...space, joined: join, myRole: join ? role : null }, !join, previousRole, false);
      toast(
        join
          ? `You joined ${space.name}. It’s in Your spaces now.`
          : `You left ${space.name}. Capsules you’re on or follow stay with you.`,
        { undo },
      );
    });
  }

  return {
    pending,
    toggle: (space: MembershipState) =>
      set(space, !space.joined, space.joined ? null : "member", true),
  };
}

/** "Join", or "Joined" that turns into "Leave" on hover (prototype .sp-joined). */
export function MembershipButton({
  space,
  onToggle,
  disabled,
}: {
  space: MembershipState;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      className={cn("group min-w-[84px] flex-none", space.joined && "hover:border-border-strong")}
      aria-label={space.joined ? `Leave ${space.name}` : `Join ${space.name}`}
      disabled={disabled}
      onClick={onToggle}
    >
      {space.joined ? (
        <>
          <span className="inline-flex items-center gap-1.5 group-hover:hidden group-focus-visible:hidden">
            <Check size={14} />
            Joined
          </span>
          <span className="hidden group-hover:inline group-focus-visible:inline">Leave</span>
        </>
      ) : (
        "Join"
      )}
    </Button>
  );
}
