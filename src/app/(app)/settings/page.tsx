import type { Metadata } from "next";
import { ComingLater, Page } from "@/components/page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Page title="Settings">
      <ComingLater step={11}>
        Profile and appearance, plus Org components for admins. For now, change the theme from your
        profile menu at the bottom of the sidebar.
      </ComingLater>
    </Page>
  );
}
