import type { Metadata } from "next";
import { ComingLater, Page } from "@/components/page";

export const metadata: Metadata = { title: "Capsules" };

export default function CapsulesPage() {
  return (
    <Page title="Capsules">
      <ComingLater step={5}>Every capsule you can see, across all spaces.</ComingLater>
    </Page>
  );
}
