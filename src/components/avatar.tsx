import { Sparkle } from "@phosphor-icons/react/dist/ssr";
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
  size?: 22 | 24 | 28 | 32 | 48;
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
          : size <= 32
            ? "text-[13px]"
            : "text-lg";
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

/**
 * A person's avatar with the AI app that acted for them layered in front
 * (design-decisions.md: agents sit in front of the person they act for).
 * Without `via`, it's the plain avatar.
 */
export function ActorAvatar({
  via,
  ...props
}: React.ComponentProps<typeof Avatar> & { via?: string | null }) {
  if (!via) return <Avatar {...props} />;
  const size = props.size ?? 22;
  const badge = size >= 28 ? 16 : 14;
  return (
    <span className="relative inline-flex flex-none" style={{ width: size, height: size }}>
      <Avatar {...props} />
      <span
        title={`via ${via}`}
        aria-label={`via ${via}`}
        className="absolute -right-1 -bottom-1 inline-flex items-center justify-center rounded-full bg-c-purple text-c-purple-fg shadow-[0_0_0_2px_var(--surface)]"
        style={{ width: badge, height: badge }}
      >
        <Sparkle size={badge - 6} weight="fill" aria-hidden="true" />
      </span>
    </span>
  );
}

/** "via Claude", after the person's name. */
export function ViaApp({ via }: { via?: string | null }) {
  if (!via) return null;
  return <span className="font-normal text-muted-foreground">via {via} </span>;
}
