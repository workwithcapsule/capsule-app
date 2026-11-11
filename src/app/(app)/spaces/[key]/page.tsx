import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComingLater, Page } from "@/components/page";
import { SAMPLE_SPACES } from "@/lib/sample-data";

function findSpace(key: string) {
  return SAMPLE_SPACES.find((s) => s.key.toLowerCase() === key.toLowerCase());
}

export function generateStaticParams() {
  return SAMPLE_SPACES.map((s) => ({ key: s.key.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/spaces/[key]">): Promise<Metadata> {
  const space = findSpace((await params).key);
  return { title: space ? `${space.name} capsules` : "Space" };
}

export default async function SpacePage({ params }: PageProps<"/spaces/[key]">) {
  const space = findSpace((await params).key);
  if (!space) notFound();
  return (
    <Page
      title={`${space.name} capsules`}
      description={
        <>
          Public space · key prefix <span className="font-mono text-xs">{space.key}</span> ·{" "}
          <Link
            href="/capsules"
            className="font-medium text-foreground underline underline-offset-[3px]"
          >
            All capsules
          </Link>
        </>
      }
    >
      <ComingLater step={4}>Every capsule in this space that you can see.</ComingLater>
    </Page>
  );
}
