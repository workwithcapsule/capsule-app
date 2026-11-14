import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/page";
import { exampleStatus } from "@/lib/examples/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { exampleUser } from "./actions";
import { ExamplesPanel } from "./examples-panel";

export const metadata: Metadata = { title: "Example data" };

async function Panel() {
  const me = await exampleUser();
  if (!me) notFound();
  const admin = createAdminClient();
  const status = admin
    ? await exampleStatus(admin, me.orgId).catch((e: Error) => ({ error: e.message }))
    : { error: "The server’s Supabase secret key isn’t set." };
  return <ExamplesPanel status={status} />;
}

/** Only for the emails in EXAMPLE_DATA_EMAILS; everyone else gets "not found". */
export default function ExamplesPage() {
  return (
    <Page
      title="Example data"
      description="Fill your org with an example of every feature so far, with you in each role. Only you can see this page."
    >
      <Suspense>
        <Panel />
      </Suspense>
    </Page>
  );
}
