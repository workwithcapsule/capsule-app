import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadSpacePage } from "@/lib/spaces";
import { SpaceView } from "./space-view";

export async function generateMetadata({ params }: PageProps<"/spaces/[key]">): Promise<Metadata> {
  const space = await loadSpacePage((await params).key);
  return { title: space ? `${space.name} capsules` : "Space" };
}

async function Space({ params }: { params: PageProps<"/spaces/[key]">["params"] }) {
  const space = await loadSpacePage((await params).key);
  if (!space) notFound();
  return <SpaceView initial={space} />;
}

export default function SpacePageRoute({ params }: PageProps<"/spaces/[key]">) {
  return (
    <Suspense>
      <Space params={params} />
    </Suspense>
  );
}
