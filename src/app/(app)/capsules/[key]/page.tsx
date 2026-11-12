import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { loadCapsule } from "@/lib/capsules";
import { CapsuleView } from "./capsule-view";

export async function generateMetadata({
  params,
}: PageProps<"/capsules/[key]">): Promise<Metadata> {
  const data = await loadCapsule((await params).key);
  return { title: data ? `${data.capsule.key} ${data.capsule.name}` : "Capsule" };
}

async function Capsule({ params }: { params: PageProps<"/capsules/[key]">["params"] }) {
  const data = await loadCapsule((await params).key);
  if (!data) {
    // Same message whether it doesn't exist or this person can't see it.
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 px-4 pt-24 text-center">
        <LockSimple size={20} className="text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">You don’t have access to this capsule</h1>
        <p className="text-muted-foreground">
          It may not exist, or it’s in an organization you’re not part of.
        </p>
        <Button asChild variant="secondary" size="md">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    );
  }
  return <CapsuleView initial={data} />;
}

export default function CapsulePage({ params }: PageProps<"/capsules/[key]">) {
  return (
    <Suspense>
      <Capsule params={params} />
    </Suspense>
  );
}
