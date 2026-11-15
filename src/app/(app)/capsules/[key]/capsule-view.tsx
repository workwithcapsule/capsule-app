"use client";

import { useSearchParams } from "next/navigation";
import { AttentionList } from "@/components/attention-list";
import type { CapsuleData } from "@/lib/capsule-types";
import { permissionsFor } from "@/lib/capsule-types";
import { ActivitySection } from "./activity-section";
import { AttachmentsSection } from "./attachments-section";
import { CapsuleHeader } from "./capsule-header";
import { ComponentsSection } from "./components-section";
import { Overview } from "./overview";
import { TeamSection } from "./team-section";
import { useCapsule } from "./use-capsule";

/**
 * The capsule page (design-decisions.md sections 2, 3 and 10). Activity and
 * comments are in the side panel. People not on the team get the follower
 * view. "Needs you here" lists your own rows from Home for this capsule.
 * Opening from Home (?item=, ?component=, ?activity=1) selects that exact
 * thing. Attachments sit under Components.
 */
export function CapsuleView({ initial }: { initial: CapsuleData }) {
  const { view, change } = useCapsule(initial);
  const perms = permissionsFor(view);
  const params = useSearchParams();
  const focusItem = params.get("item");
  const focusComponent =
    view.items.find((i) => i.id === focusItem)?.componentId ?? params.get("component");
  const focus = { item: focusItem, component: focusComponent };

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-4 pt-6 pb-[120px] laptop:px-8">
      <CapsuleHeader view={view} perms={perms} change={change} />
      {perms.onTeam && view.needsMe.length > 0 && (
        <section aria-labelledby="nyh-h" className="flex flex-col gap-3">
          <h2 id="nyh-h" className="text-base leading-6 font-semibold">
            Needs you here{" "}
            <span className="font-normal text-muted-foreground">{view.needsMe.length}</span>
          </h2>
          <AttentionList
            rows={view.needsMe}
            orgId={view.capsule.orgId}
            people={view.people}
            variant="capsule"
          />
        </section>
      )}
      <div className="flex flex-wrap items-start gap-6">
        {perms.onTeam ? (
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Overview view={view} />
            <ComponentsSection view={view} perms={perms} change={change} focus={focus} />
            <AttachmentsSection view={view} perms={perms} change={change} />
          </div>
        ) : (
          // The follower view (anyone not on the team): Overview, then
          // Activity, then components ordered by risk, all read-only.
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Overview view={view} />
            <ActivitySection view={view} perms={perms} change={change} variant="follower" />
            <ComponentsSection view={view} perms={perms} change={change} focus={focus} />
            <AttachmentsSection view={view} perms={perms} change={change} />
          </div>
        )}
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <TeamSection view={view} perms={perms} change={change} />
          {perms.onTeam && <ActivitySection view={view} perms={perms} change={change} />}
        </aside>
      </div>
    </div>
  );
}
