"use client";

import { CaretDown, Check, Plus } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CapsuleData, PersonRef } from "@/lib/capsule-types";
import { cn } from "@/lib/utils";
import { followCapsule, unfollowCapsule } from "../actions";
import type { useCapsule } from "./use-capsule";

type Change = ReturnType<typeof useCapsule>["change"];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW = 6;

/** "+ Follow", or "Following ⌄" with Unfollow inside (design-decisions.md section 10). */
export function FollowButton({ view, change }: { view: CapsuleData; change: Change }) {
  const c = view.capsule;
  const mine = view.followers.find((f) => f.userId === view.me.id);

  function follow(since?: string) {
    change(
      { type: "follow", userId: view.me.id, since: since ?? new Date().toISOString() },
      () => followCapsule({ orgId: c.orgId, capsuleId: c.id, since }),
      since
        ? {}
        : {
            message: `Following ${c.name}. Its changes show up in your Activity.`,
            undo: {
              op: { type: "unfollow", userId: view.me.id },
              save: () => unfollowCapsule(c.id),
            },
          },
    );
  }

  function unfollow() {
    const since = mine?.since;
    change({ type: "unfollow", userId: view.me.id }, () => unfollowCapsule(c.id), {
      message: `Unfollowed ${c.name}.`,
      undo: {
        op: { type: "follow", userId: view.me.id, since: since ?? new Date().toISOString() },
        save: () => followCapsule({ orgId: c.orgId, capsuleId: c.id, since }),
      },
    });
  }

  if (!mine) {
    return (
      <Button variant="primary" size="lg" onClick={() => follow()}>
        <Plus size={14} />
        Follow
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="lg">
          <Check size={14} />
          Following
          <CaretDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={unfollow}>Unfollow</DropdownMenuItem>
        <p className="px-2.5 pt-0.5 pb-2 text-xs text-muted-foreground">
          You’ll stop seeing this capsule’s changes in Activity.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Faces and "N following"; opens the list, with "+N this week" (design-decisions.md section 10). */
export function FollowersPill({ view }: { view: CapsuleData }) {
  const people = view.followers
    .map((f) => ({ ...f, person: view.people.find((p) => p.id === f.userId) }))
    .filter((f): f is typeof f & { person: PersonRef } => Boolean(f.person));
  // eslint-disable-next-line react-hooks/purity -- "this week" is relative to now; a stale value for a few seconds is fine.
  const now = Date.now();
  const isNew = (since: string) => now - new Date(since).getTime() < WEEK_MS;
  const fresh = people.filter((f) => isNew(f.since)).length;
  const n = people.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="lg"
          className={cn(n > 0 && "pl-1.5")}
          aria-label={`${n} following. Show followers`}
        >
          {n > 0 && (
            <span className="flex" aria-hidden="true">
              {people.slice(0, 3).map((f, i) => (
                <Avatar
                  key={f.userId}
                  name={f.person.name}
                  initials={f.person.initials}
                  size={28}
                  className={cn("ring-2 ring-surface", i > 0 && "-ml-2")}
                />
              ))}
            </span>
          )}
          <span>
            <b className="font-semibold">{n}</b> following
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-1">
        <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-1">
          <span className="text-[15px] font-semibold">
            {n} {n === 1 ? "person" : "people"} following
          </span>
          {fresh > 0 && (
            <span className="text-xs font-medium text-c-green-fg">+{fresh} this week</span>
          )}
        </div>
        <p className="px-2.5 pb-2 text-xs text-muted-foreground">
          Followers see this capsule’s changes in their Activity. They can read it, but can’t edit
          or comment.
        </p>
        {n > 0 ? (
          <ul>
            {people.slice(0, SHOW).map((f) => (
              <li
                key={f.userId}
                className={cn(
                  "mt-0.5 flex min-h-10 items-center gap-2.5 rounded-lg px-2.5",
                  isNew(f.since) && "bg-bg",
                )}
              >
                <Avatar
                  name={f.person.name}
                  initials={f.person.initials}
                  me={isNew(f.since)}
                  size={24}
                />
                <span className="flex-1 truncate text-[13px] font-medium">
                  {f.userId === view.me.id ? `${f.person.name} (you)` : f.person.name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2.5 pb-2.5 text-[13px] text-muted-foreground">No one follows it yet.</p>
        )}
        {n > SHOW && (
          <p className="mt-1 border-t border-divider px-2.5 pt-2 pb-1.5 text-xs text-muted-foreground">
            and {n - SHOW} more
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
