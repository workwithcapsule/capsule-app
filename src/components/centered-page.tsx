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

/** Sign out, as a form so it works without JavaScript. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={className}>
      <button
        type="submit"
        className="text-[13px] font-medium text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
