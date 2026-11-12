"use client";

import type { CapsuleData } from "@/lib/capsule-types";
import { permissionsFor } from "@/lib/capsule-types";
import { CapsuleHeader } from "./capsule-header";
import { ComponentsSection } from "./components-section";
import { Overview } from "./overview";
import { TeamSection } from "./team-section";
import { useCapsule } from "./use-capsule";

/**
 * The capsule page (design-decisions.md sections 2, 3 and 10). Activity and
 * comments (step 6), Follow (step 7), Needs you here (step 8) and
 * Attachments (step 10) join this page later.
 */
export function CapsuleView({ initial }: { initial: CapsuleData }) {
  const { view, change } = useCapsule(initial);
  const perms = permissionsFor(view);

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-4 pt-6 pb-[120px] laptop:px-8">
      <CapsuleHeader view={view} perms={perms} change={change} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <Overview view={view} />
          <ComponentsSection view={view} perms={perms} change={change} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <TeamSection view={view} perms={perms} change={change} />
        </aside>
      </div>
    </div>
  );
}
