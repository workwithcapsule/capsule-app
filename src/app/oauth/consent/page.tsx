import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CenteredPage } from "@/components/centered-page";
import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { allowApp, denyApp } from "./actions";

export const metadata: Metadata = { title: "Allow an AI app" };

/*
 * Where an AI app (Claude, ChatGPT, ...) sends someone to approve it (step
 * 13). Supabase Auth's OAuth server sends them here with ?authorization_id;
 * signed-out people sign in first and come back.
 */

const CAN = [
  "See what you can see: Needs your attention, your work items, capsules and spaces",
  "Create capsules, add and update work items, and comment, as you",
  "Every change shows in Capsule as yours, made via the app",
];

function hostOf(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <CenteredPage>
      <Wordmark />
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">{body}</p>
      </div>
    </CenteredPage>
  );
}

async function Consent({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const id = params.authorization_id;
  if (!id)
    return (
      <Problem
        title="This link has expired"
        body="Go back to the AI app and connect Capsule again."
      />
    );

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data)
    return (
      <Problem
        title="This link has expired"
        body="Go back to the AI app and connect Capsule again."
      />
    );
  // Already allowed before: straight back to the app.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const app = data.client.name?.trim() || "An AI app";
  const host = hostOf(data.redirect_uri);

  return (
    <CenteredPage>
      <Wordmark />
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Allow {app} to use Capsule as you?
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Signed in as {data.user.email}
          {host && (
            <>
              . After you choose, you’ll go back to <span className="text-foreground">{host}</span>
            </>
          )}
          .
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">{app} will be able to:</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-5 text-muted-foreground">
          {CAN.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
          It can’t remove or delete anything, change settings or invite people. It only gets your
          permissions, never more.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form action={allowApp}>
          <input type="hidden" name="authorization_id" value={data.authorization_id} />
          <Button type="submit" variant="primary" size="lg">
            Allow
          </Button>
        </form>
        <form action={denyApp}>
          <input type="hidden" name="authorization_id" value={data.authorization_id} />
          <Button type="submit" variant="secondary" size="lg">
            Deny
          </Button>
        </form>
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        You can disconnect it any time in Settings → Connected apps.
      </p>
    </CenteredPage>
  );
}

export default function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  return (
    <Suspense>
      <Consent searchParams={searchParams} />
    </Suspense>
  );
}
