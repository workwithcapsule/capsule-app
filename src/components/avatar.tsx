import { cn } from "@/lib/utils";

/** A person's initial in a circle (prototype .av). */
export function Avatar({
  name,
  initials,
  size = 22,
  me,
  className,
}: {
  name: string;
  initials: string;
  size?: 22 | 24 | 28 | 32;
  me?: boolean;
  className?: string;
}) {
  const text =
    size <= 22
      ? "text-[10px]"
      : size <= 24
        ? "text-[11px]"
        : size <= 28
          ? "text-xs"
          : "text-[13px]";
  return (
    <span
      title={name}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full font-semibold text-foreground",
        me ? "bg-avatar-me" : "bg-avatar",
        text,
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/** Overlapping faces (prototype .stack), up to `max`. */
export function AvatarStack({
  people,
  max = 4,
}: {
  people: { id: string; name: string; initials: string }[];
  max?: number;
}) {
  if (!people.length) return null;
  return (
    <span className="inline-flex items-center pl-1.5" aria-hidden="true">
      {people.slice(0, max).map((p) => (
        <Avatar
          key={p.id}
          name={p.name}
          initials={p.initials}
          className="relative -ml-1.5 shadow-[0_0_0_2px_var(--surface)]"
        />
      ))}
    </span>
  );
}
