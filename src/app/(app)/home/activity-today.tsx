"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ActorAvatar, ViaApp } from "@/components/avatar";
import { buildFeed, describe, forFollowers, kindLabel, splitMentions } from "@/lib/activity";
import type { HomeCapsule, HomeData } from "@/lib/home";
import { fmtRelative } from "@/lib/dates";
import { localDay, useLocalTime } from "@/lib/use-local-time";

const SHOW = 6;

/**
 * Activity today, across capsules you're on or follow (build-decisions.md 11).
 * For capsules you only follow, it shows what a follower sees (dates, status,
 * scope, milestones and comments).
 */
export function ActivityToday({ data }: { data: HomeData }) {
  const local = useLocalTime();
  const [all, setAll] = useState(false);

  const entries = useMemo(() => {
    if (!local) return null;
    const byCapsule = new Map<string, HomeData["events"]>();
    for (const e of data.events) {
      byCapsule.set(e.capsuleId, [...(byCapsule.get(e.capsuleId) ?? []), e]);
    }
    const out: { e: ReturnType<typeof buildFeed>[number]; cap: HomeCapsule }[] = [];
    for (const cap of data.capsules) {
      const feed = buildFeed(byCapsule.get(cap.id) ?? []);
      for (const e of cap.followerOnly ? feed.filter(forFollowers) : feed) {
        if (localDay(new Date(e.at)) === local.day) out.push({ e, cap });
      }
    }
    return out.sort((a, b) => b.e.at.localeCompare(a.e.at));
  }, [data, local]);

  return (
    <section aria-labelledby="feed-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="feed-h" className="text-base leading-6 font-semibold">
          Activity today
        </h2>
        <span className="text-[13px] text-muted-foreground">
          Across capsules you’re in or follow
        </span>
      </div>
      {entries === null ? (
        <div className="h-24 rounded-2xl border border-border bg-surface shadow-card" />
      ) : entries.length ? (
        <ol className="rounded-2xl border border-border bg-surface px-5 py-1 shadow-card">
          {(all ? entries : entries.slice(0, SHOW)).map(({ e, cap }) => {
            const actor = data.people.find((p) => p.id === e.actorId);
            const isMe = e.actorId === data.me.id;
            const text = describe(e, {
              meId: data.me.id,
              nameOf: (id) => data.people.find((p) => p.id === id)?.name,
              dateType: "launch",
            });
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 border-b border-divider py-3.5 last:border-b-0"
              >
                <ActorAvatar
                  name={actor?.name ?? "Someone"}
                  initials={actor?.initials ?? "?"}
                  size={28}
                  me={isMe}
                  via={e.via}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="m-0 text-sm break-words">
                    <b className="font-semibold">{isMe ? "You" : (actor?.name ?? "Someone")}</b>{" "}
                    <ViaApp via={e.via} />
                    {e.kind === "comment"
                      ? splitMentions(text, data.people).map((part, i) =>
                          part.mention ? (
                            <span key={i} className="font-medium text-c-blue-fg">
                              {part.text}
                            </span>
                          ) : (
                            <span key={i}>{part.text}</span>
                          ),
                        )
                      : text}
                  </p>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-muted-foreground">
                    <Link
                      href={`/capsules/${cap.key.toLowerCase()}`}
                      className="font-medium text-muted-foreground hover:text-foreground"
                    >
                      {cap.name}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <span>{kindLabel(e)}</span>
                  </span>
                </div>
                <span className="flex-none text-xs leading-5 text-muted-foreground">
                  {fmtRelative(e.at)}
                </span>
              </li>
            );
          })}
          <li className="py-3 text-[13px] text-muted-foreground">
            {entries.length > SHOW && !all ? (
              <button
                type="button"
                onClick={() => setAll(true)}
                className="font-medium hover:text-foreground hover:underline"
              >
                And {entries.length - SHOW} more update{entries.length - SHOW === 1 ? "" : "s"}{" "}
                today. Show all
              </button>
            ) : (
              "That’s everything from today."
            )}
          </li>
        </ol>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-card">
          <p className="font-semibold">Nothing yet today</p>
          <p className="text-[13px] text-muted-foreground">
            When people move work forward on capsules you’re in or follow, it shows up here.
          </p>
        </div>
      )}
    </section>
  );
}
