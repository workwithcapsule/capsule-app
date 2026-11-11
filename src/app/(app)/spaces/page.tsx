import type { Metadata } from "next";
import { ComingLater, Page } from "@/components/page";

export const metadata: Metadata = { title: "Browse spaces" };

export default function BrowseSpacesPage() {
  return (
    <Page title="Browse spaces">
      <ComingLater step={4}>
        The directory of public spaces, where you can join and leave them.
      </ComingLater>
    </Page>
  );
}
