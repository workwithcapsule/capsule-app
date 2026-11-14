import { Suspense } from "react";
import { AttentionList } from "@/components/attention-list";
import { loadHome } from "@/lib/home";
import { ActivityToday } from "./home/activity-today";
import { Greeting } from "./home/greeting";

async function HomeContent() {
  const data = await loadHome();
  if (!data) return null;
  return (
    <>
      <Greeting name={data.me.name} />
      <section aria-labelledby="attn-h" className="flex flex-col gap-3">
        <h2 id="attn-h" className="text-base leading-6 font-semibold">
          Needs your attention{" "}
          {data.attention.length > 0 && (
            <span className="font-normal text-muted-foreground">{data.attention.length}</span>
          )}
        </h2>
        <AttentionList
          rows={data.attention}
          orgId={data.orgId}
          people={data.people}
          variant="home"
        />
      </section>
      <ActivityToday data={data} />
    </>
  );
}

/** Home (design-decisions.md section 9): what needs you, then today's activity. */
export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-8 px-4 pt-6 pb-[72px] laptop:px-8 laptop:pt-10">
      <Suspense>
        <HomeContent />
      </Suspense>
    </div>
  );
}
