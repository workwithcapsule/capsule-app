"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarStack } from "@/components/avatar";
import { EditableText } from "@/components/editable-text";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import type { SpacePage } from "@/lib/spaces";
import { updateSpace } from "../actions";
import { MembershipButton, useMembership } from "../membership";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "[Space] capsules" (design-decisions.md section 14), for members and non-members. */
export function SpaceView({ initial }: { initial: SpacePage }) {
  const toast = useToast();
  const [space, setSpace] = useState(initial);
  const { toggle, pending } = useMembership((_, joined, role) =>
    setSpace((s) => ({
      ...s,
      joined,
      myRole: role,
      members: joined
        ? [...s.members.filter((m) => m.id !== s.me.id), s.me]
        : s.members.filter((m) => m.id !== s.me.id),
    })),
  );

  async function save(patch: { name?: string; description?: string }) {
    const r = await updateSpace(space.id, patch);
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setSpace((s) => ({
      ...s,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description || null }),
    }));
    toast(patch.name !== undefined ? "Space renamed." : "Description saved.");
    return true;
  }

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-4 pt-6 pb-[72px] laptop:px-8 laptop:pt-10">
      <header className="flex flex-col gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
        >
          <Link
            href="/capsules"
            className="text-muted-foreground no-underline hover:text-foreground hover:underline"
          >
            All capsules
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{space.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
              {space.canManage ? (
                <EditableText
                  value={space.name}
                  label="Space name"
                  required
                  maxLength={80}
                  onSave={(name) => save({ name })}
                  inputClassName="h-10 text-[24px] font-semibold"
                />
              ) : (
                <span>{space.name}</span>
              )}
              <span>capsules</span>
            </h1>
            {space.canManage ? (
              <EditableText
                value={space.description ?? ""}
                label="Space description"
                placeholder="Add a description"
                maxLength={200}
                onSave={(description) => save({ description })}
                className="text-muted-foreground"
                inputClassName="h-8 text-sm"
              />
            ) : (
              space.description && <p className="text-muted-foreground">{space.description}</p>
            )}
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <AvatarStack people={space.members} />
              Public · {plural(space.members.length, "member")} · key prefix{" "}
              <span className="font-mono text-xs">{space.keyPrefix}</span>
            </span>
          </div>
          <MembershipButton space={space} disabled={pending} onToggle={() => toggle(space)} />
        </div>
      </header>

      <section aria-labelledby="caps-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="caps-h" className="text-base leading-6 font-semibold">
            Capsules{" "}
            <span className="font-normal text-muted-foreground">{space.capsules.length}</span>
          </h2>
          <Button asChild variant="secondary">
            <Link href={`/new?space=${space.keyPrefix.toLowerCase()}`}>
              New capsule in {space.name}
            </Link>
          </Button>
        </div>
        {space.capsules.length ? (
          <ul className="rounded-2xl border border-border bg-surface shadow-card">
            {space.capsules.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-divider px-5 py-3.5 first:border-t-0"
              >
                <span className="w-16 flex-none font-mono text-xs text-muted-foreground">
                  {c.key}
                </span>
                <Link
                  href={`/capsules/${c.key.toLowerCase()}`}
                  className="min-w-0 flex-1 truncate font-medium text-foreground no-underline hover:underline"
                >
                  {c.name}
                </Link>
                <StatusPill status={c.status} />
                <span className="flex w-40 flex-none items-center gap-2 text-[13px] text-muted-foreground">
                  {c.owner ? (
                    <>
                      <Avatar name={c.owner.name} initials={c.owner.initials} />
                      <span className="truncate">{c.owner.name}</span>
                    </>
                  ) : (
                    "No owner"
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-dash px-5 py-4 text-[13px] text-muted-foreground">
            No capsules in {space.name} yet. They’ll show up here once someone creates one.
          </p>
        )}
      </section>
    </div>
  );
}
