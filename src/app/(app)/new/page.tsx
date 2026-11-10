import type { Metadata } from "next";
import { ComingLater, Page } from "@/components/page";

export const metadata: Metadata = { title: "New capsule" };

export default function NewCapsulePage() {
  return (
    <Page title="New capsule">
      <ComingLater step={9}>
        Describe the outcome and let AI shape it, or fill in the fields yourself (step 5).
      </ComingLater>
    </Page>
  );
}
