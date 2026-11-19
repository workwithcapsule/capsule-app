import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { loadCapsulesList } from "@/lib/capsules-list";
import { CapsulesTable } from "./capsules-table";

export const metadata: Metadata = { title: "Capsules" };

async function List() {
  const data = await loadCapsulesList();
  if (!data) return null;
  return <CapsulesTable rows={data.rows} spaces={data.spaces} meId={data.meId} />;
}

export default function CapsulesPage() {
  return (
    <Page
      title="Capsules"
      description="Every capsule you created, work on or follow."
      action={
        <Button asChild variant="primary" size="lg">
          <Link href="/new">
            <Plus size={16} aria-hidden="true" />
            New capsule
          </Link>
        </Button>
      }
    >
      <Suspense>
        <List />
      </Suspense>
    </Page>
  );
}
