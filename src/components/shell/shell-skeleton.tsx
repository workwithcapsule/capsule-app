/**
 * What shows for a moment while the sidebar's data loads: the same frame
 * as the real shell, without anything that depends on the person or page.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col laptop:flex-row" aria-busy="true">
      <div className="h-[57px] flex-none border-b border-border laptop:hidden" />
      <div className="sb-auto sticky top-0 hidden h-dvh w-[248px] flex-none border-r border-border laptop:block rail:w-[68px]">
        <div className="px-5 pt-[22px] text-lg leading-6 font-semibold tracking-[-0.02em] rail:hidden">
          Capsule
        </div>
      </div>
      <main className="min-w-0 flex-1" />
    </div>
  );
}
