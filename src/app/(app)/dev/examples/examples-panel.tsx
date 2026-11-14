"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { deleteExamples, refreshExamples } from "./actions";

type Status = { exists: boolean; capsules: { key: string; name: string }[] } | { error: string };

/** What each example is for. Each build step adds to this list. */
const ROLES: Record<string, string> = {
  "EX-1":
    "You own it: teammates on components, items assigned to you, a blocked component, and a comment that @mentions you.",
  "EX-2": "You work on it: Dana owns it, you own one component and have an item.",
  "EX-3": "You follow it: the follower view, its filtered Activity and “+1 this week”.",
  "EX-4": "You can see it but aren’t on it: the + Follow button.",
};

export function ExamplesPanel({ status }: { status: Status }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function go(action: typeof refreshExamples) {
    setConfirming(false);
    start(async () => {
      const r = await action();
      toast(r.ok ? r.message : r.error);
    });
  }

  if ("error" in status) {
    return <p className="text-c-red-fg">{status.error}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <p className="text-sm text-muted-foreground">
          Everything goes in an <b className="font-semibold text-foreground">Examples</b> space (key
          EX) with three example teammates: Dana, Jon and Bob. Their emails are “+” versions of
          yours, so anything sent to them reaches you. Refreshing replaces the examples with a fresh
          set. Your real spaces and capsules are never touched.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending} onClick={() => go(refreshExamples)}>
            {pending ? "Working…" : status.exists ? "Refresh examples" : "Create examples"}
          </Button>
          {status.exists &&
            (confirming ? (
              <>
                <span className="text-[13px]">
                  Remove the Examples space and example teammates?
                </span>
                <Button variant="secondary" disabled={pending} onClick={() => go(deleteExamples)}>
                  Remove
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => setConfirming(true)}>
                Remove examples
              </Button>
            ))}
        </div>
      </section>

      {status.exists && (
        <section aria-labelledby="ex-h" className="flex flex-col gap-3">
          <h2 id="ex-h" className="text-base leading-6 font-semibold">
            The examples
          </h2>
          <ul className="rounded-2xl border border-border bg-surface shadow-card">
            {status.capsules.map((c) => (
              <li
                key={c.key}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-divider px-5 py-3.5 first:border-t-0"
              >
                <span className="w-12 flex-none font-mono text-xs text-muted-foreground">
                  {c.key}
                </span>
                <Link
                  href={`/capsules/${c.key.toLowerCase()}`}
                  className="font-medium text-foreground no-underline hover:underline"
                >
                  {c.name}
                </Link>
                <span className="basis-full text-[13px] text-muted-foreground laptop:flex-1 laptop:basis-auto">
                  {ROLES[c.key]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
