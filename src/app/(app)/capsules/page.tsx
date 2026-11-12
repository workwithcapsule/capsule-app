import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/page";
import { loadCapsulesList } from "@/lib/capsules-list";
import { CapsulesTable } from "./capsules-table";

export const metadata: Metadata = { title: "Capsules" };

async function List() {
  const data = await loadCapsulesList();
  if (!data) return null;
  return <CapsulesTable rows={data.rows} spaces={data.spaces} />;
}

export default function CapsulesPage() {
  return (
    <Page title="Capsules" description="Every capsule you created, work on or follow.">
      <Suspense>
        <List />
      </Suspense>
    </Page>
  );
}
