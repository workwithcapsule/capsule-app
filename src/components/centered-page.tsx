import { cn } from "@/lib/utils";

/** A simple centered page outside the app (sign-in, invite-only, welcome). */
export function CenteredPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className={cn("flex w-full max-w-[440px] flex-col gap-6", className)}>{children}</div>
    </main>
  );
}

export { SignOutButton } from "@/components/sign-out-button";
