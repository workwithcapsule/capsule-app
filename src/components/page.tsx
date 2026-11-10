import { cn } from "@/lib/utils";

/** The main column every page sits in (prototype .main). */
export function Page({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-[1120px] flex-col gap-8 px-4 pt-6 pb-[72px] laptop:px-8 laptop:pt-10",
        className,
      )}
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </header>
      {children}
    </div>
  );
}

/** Marks a page that is only a placeholder in this build step. */
export function ComingLater({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-dash p-6">
      <span className="inline-flex h-7 items-center rounded-full border border-dashed border-dash px-3 text-xs text-muted-foreground">
        Build step {step}
      </span>
      <p className="text-muted-foreground">{children}</p>
    </section>
  );
}
