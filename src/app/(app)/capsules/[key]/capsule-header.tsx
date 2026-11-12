"use client";

import Link from "next/link";
import { CalendarBlank, CaretRight, LinkSimple } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { EditableText } from "@/components/editable-text";
import { DateField, PersonPicker, StatusPicker } from "@/components/pickers";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { STATUS_META } from "@/lib/design";
import { fmtDate } from "@/lib/dates";
import type { CapsuleData, Permissions } from "@/lib/capsule-types";
import { updateCapsule } from "../actions";
import { FollowButton, FollowersPill } from "./follow-controls";
import type { useCapsule } from "./use-capsule";

type Change = ReturnType<typeof useCapsule>["change"];

/** Name, outcome and the status / space / owner / date row (prototype capsule header). */
export function CapsuleHeader({
  view,
  perms,
  change,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
}) {
  const toast = useToast();
  const c = view.capsule;
  const owner = view.people.find((p) => p.id === c.ownerId) ?? null;
  const dateLabel = c.dateType === "due" ? "Due" : "Launch";

  async function saveText(field: "name" | "outcome", value: string) {
    const before = c[field] ?? "";
    const r = await updateCapsule(c.id, { [field]: value || null });
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    toast(field === "name" ? "Name saved." : "Outcome saved.", {
      undo: () =>
        change({ type: "capsule", patch: { [field]: before } }, () =>
          updateCapsule(c.id, { [field]: before || null }),
        ),
    });
    return true;
  }

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
        >
          <Link
            href={`/spaces/${c.space.keyPrefix.toLowerCase()}`}
            className="text-muted-foreground no-underline hover:text-foreground hover:underline"
          >
            {c.space.name}
          </Link>
          <CaretRight size={12} aria-hidden="true" />
          <span className="font-mono text-xs">{c.key}</span>
        </nav>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-1.5">
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">
            {perms.isOwner ? (
              <EditableText
                value={c.name}
                label="Capsule name"
                required
                maxLength={200}
                onSave={(v) => saveText("name", v)}
                inputClassName="h-11 text-[24px] font-semibold"
              />
            ) : (
              c.name
            )}
          </h1>
          {perms.isOwner ? (
            <EditableText
              value={c.outcome ?? ""}
              label="Outcome"
              placeholder="Add an outcome"
              multiline
              maxLength={1000}
              onSave={(v) => saveText("outcome", v)}
              className="max-w-[760px] text-[15px] leading-[22px] text-muted-foreground"
              inputClassName="text-[15px] leading-[22px]"
            />
          ) : (
            c.outcome && (
              <p className="max-w-[760px] text-[15px] leading-[22px] text-muted-foreground">
                {c.outcome}
              </p>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <FollowersPill view={view} />
          {/* Team members already see everything, so they get Share instead of Follow. */}
          {perms.onTeam ? (
            <Button
              variant="secondary"
              size="lg"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast("Link copied.");
                } catch {
                  toast("Couldn’t copy the link. Copy it from the address bar instead.");
                }
              }}
            >
              <LinkSimple size={14} />
              Share
            </Button>
          ) : (
            <FollowButton view={view} change={change} />
          )}
        </div>
      </div>

      <dl className="flex flex-wrap items-center gap-x-7 gap-y-2.5 text-[13px]">
        <div className="flex shrink-0 items-center gap-2">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center font-medium">
            {perms.isOwner ? (
              <StatusPicker
                value={c.status}
                label="Capsule status"
                onPick={(status) =>
                  change(
                    { type: "capsule", patch: { status } },
                    () => updateCapsule(c.id, { status }),
                    {
                      message: `Status changed to ${STATUS_META[status].label}.`,
                      undo: {
                        op: { type: "capsule", patch: { status: c.status } },
                        save: () => updateCapsule(c.id, { status: c.status }),
                      },
                    },
                  )
                }
              />
            ) : (
              <StatusPill status={c.status} />
            )}
          </dd>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <dt className="text-muted-foreground">Space</dt>
          <dd className="font-medium">{c.space.name}</dd>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <dt className="text-muted-foreground">Owner</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            {perms.isOwner ? (
              <PersonPicker
                value={c.ownerId}
                people={view.people}
                meId={view.me.id}
                label="Capsule owner"
                className="max-w-none"
                onPick={(ownerId) => {
                  const name = view.people.find((p) => p.id === ownerId)?.name ?? "nobody";
                  change(
                    { type: "capsule", patch: { ownerId } },
                    () => updateCapsule(c.id, { owner_id: ownerId }),
                    {
                      message: `${name} owns this capsule now.`,
                      undo: {
                        op: { type: "capsule", patch: { ownerId: c.ownerId } },
                        save: () => updateCapsule(c.id, { owner_id: c.ownerId }),
                      },
                    },
                  );
                }}
              />
            ) : owner ? (
              <>
                <Avatar name={owner.name} initials={owner.initials} />
                {owner.name}
              </>
            ) : (
              <span className="text-faint">No owner</span>
            )}
          </dd>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <dt className="text-muted-foreground">{dateLabel}</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <CalendarBlank size={14} className="text-muted-foreground" aria-hidden="true" />
            {perms.isOwner ? (
              <DateField
                value={c.launchDate}
                label={`${dateLabel} date`}
                onPick={(launchDate) =>
                  change(
                    { type: "capsule", patch: { launchDate } },
                    () => updateCapsule(c.id, { launch_date: launchDate }),
                    {
                      message: launchDate
                        ? `${dateLabel} date set to ${fmtDate(launchDate)}.`
                        : `${dateLabel} date cleared.`,
                      undo: {
                        op: { type: "capsule", patch: { launchDate: c.launchDate } },
                        save: () => updateCapsule(c.id, { launch_date: c.launchDate }),
                      },
                    },
                  )
                }
              />
            ) : (
              <span>
                {c.launchDate ? fmtDate(c.launchDate) : <span className="text-faint">No date</span>}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </header>
  );
}
