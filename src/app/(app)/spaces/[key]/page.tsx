import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ComingLater, Page } from "@/components/page";
import { createClient } from "@/lib/supabase/server";

async function findSpace(key: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("spaces")
    .select("name, key_prefix")
    .eq("key_prefix", key.toUpperCase())
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/spaces/[key]">): Promise<Metadata> {
  const space = await findSpace((await params).key);
  return { title: space ? `${space.name} capsules` : "Space" };
}

async function Space({ params }: { params: PageProps<"/spaces/[key]">["params"] }) {
  const space = await findSpace((await params).key);
  if (!space) notFound();
  return (
    <Page
      title={`${space.name} capsules`}
      description={
        <>
          Public space · key prefix <span className="font-mono text-xs">{space.key_prefix}</span> ·{" "}
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

export default function SpacePage({ params }: PageProps<"/spaces/[key]">) {
  return (
    <Suspense>
      <Space params={params} />
    </Suspense>
  );
}
