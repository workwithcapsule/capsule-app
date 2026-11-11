import { ComingLater, Page } from "@/components/page";

export default function HomePage() {
  return (
    <Page title="Home">
      <ComingLater step={8}>
        Needs your attention and today&rsquo;s activity will live here. The count next to Home in
        the sidebar is sample data for now.
      </ComingLater>
    </Page>
  );
}
