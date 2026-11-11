import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { loadShellData } from "@/lib/shell-data";

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const data = await loadShellData();
  return <AppShell data={data}>{children}</AppShell>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}
