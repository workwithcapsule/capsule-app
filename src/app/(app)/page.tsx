import { Suspense } from "react";
import Link from "next/link";
import { AttentionList } from "@/components/attention-list";
import { followedOnly } from "@/lib/capsule-summary";
import { loadCapsulesList } from "@/lib/capsules-list";
import { loadHome } from "@/lib/home";
import { loadShellData } from "@/lib/shell-data";
import { ActivityToday } from "./home/activity-today";
import { FollowedCapsules } from "./home/followed-capsules";
import { Greeting } from "./home/greeting";
import { StartCapsule } from "./home/start-capsule";
import { YourCapsules } from "./home/your-capsules";

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [loaded, list, shell, params] = await Promise.all([
    loadHome(),
    loadCapsulesList(),
    loadShellData(),
    searchParams,
  ]);
  if (!loaded) return null;
  // Example data only: "?preview=follower" shows Home as someone who only follows
  // capsules, using the capsules you follow (no other access, nothing changes).
  const preview = shell.examples && params.preview === "follower";
  const data = preview
    ? {
        ...loaded,
        attention: [],
        capsules: loaded.capsules.filter((c) => c.followerOnly),
      }
    : loaded;
  const allRows = list?.rows ?? [];
  const followed = followedOnly(allRows);
  const rows = preview ? followed : allRows;
  // People who follow capsules but aren't on any open one (an exec, say) get the
  // follow overview first, and Activity before Needs your attention (prototype Bob).
  const onAny = rows.some((r) => (r.working || r.created) && r.status !== "done");
  const followerHome = followed.length > 0 && !onAny;

  const attention = (
    <section aria-labelledby="attn-h" className="flex flex-col gap-3">
      <h2 id="attn-h" className="text-base leading-6 font-semibold">
        Needs your attention
      </h2>
      <AttentionList rows={data.attention} orgId={data.orgId} people={data.people} variant="home" />
    </section>
  );
  const activity = <ActivityToday data={data} />;

  return (
    <>
      {preview && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-c-amber px-4 py-3 text-[13px] text-c-amber-fg">
          <span className="grow">
            <b className="font-semibold">Preview.</b> This is Home for someone who only follows
            capsules, built from the capsules you follow.
          </span>
          <Link href="/" className="font-medium text-c-amber-fg">
            Back to your Home
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-5">
        <Greeting name={data.me.name} />
        <StartCapsule />
      </div>
      {followerHome && <FollowedCapsules rows={followed} />}
      {/* Two columns, as in the prototype: what needs you and Activity on the left,
          Your capsules on the right (below them when there isn't room). */}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
          {followerHome ? (
            <>
              {activity}
              {attention}
            </>
          ) : (
            <>
              {attention}
              {activity}
            </>
          )}
        </div>
        <YourCapsules rows={rows} />
      </div>
    </>
  );
}

/** Home (design-decisions.md section 9): what needs you, today's activity and your capsules. */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-4 pt-6 pb-[72px] laptop:px-8 laptop:pt-10">
      <Suspense>
        <HomeContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
