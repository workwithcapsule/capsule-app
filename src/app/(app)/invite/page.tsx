import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/page";
import { emailMode } from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";
import { InviteManager, type InvitationRow } from "./invite-manager";

export const metadata: Metadata = { title: "Invite teammates" };

async function Invitations() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, orgs(email_domain)")
    .eq("user_id", claims?.claims?.sub as string)
    .limit(1)
    .maybeSingle();

  if (membership?.role !== "admin") {
    return <p className="text-muted-foreground">Only org admins can invite people.</p>;
  }

  const { data } = await supabase
    .from("invitations")
    .select("id, email, sent_at, accepted_at, created_at")
    .eq("org_id", membership.org_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const rows: InvitationRow[] = (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    sentAt: i.sent_at,
    acceptedAt: i.accepted_at,
  }));
  const domain = (membership.orgs as unknown as { email_domain: string | null } | null)
    ?.email_domain;

  return (
    <InviteManager
      orgId={membership.org_id}
      rows={rows}
      domain={domain ?? "company.com"}
      testMode={emailMode() === "test"}
    />
  );
}

export default function InvitePage() {
  return (
    <Page
      title="Invite teammates"
      description="Capsule works best when the people doing the work are in it. They’ll only see capsules they’re added to or can follow."
      className="max-w-[720px]"
    >
      <Suspense>
        <Invitations />
      </Suspense>
    </Page>
  );
}
