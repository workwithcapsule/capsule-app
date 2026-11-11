import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/page";
import { loadSpacesDirectory } from "@/lib/spaces";
import { BrowseSpaces } from "./browse";

export const metadata: Metadata = { title: "Browse spaces" };

async function Directory() {
  const data = await loadSpacesDirectory();
  if (!data) return null;
  return <BrowseSpaces initial={data.spaces} orgName={data.orgName} me={data.me} />;
}

export default function BrowseSpacesPage() {
  return (
    <Page
      title="Browse spaces"
      description="Join a space to see its capsules and keep it in your sidebar. You still choose which capsules to follow."
    >
      <Suspense>
        <Directory />
      </Suspense>
    </Page>
  );
}
