"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  List,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  SquaresFour,
  X,
} from "@phosphor-icons/react";
import { CapsuleIcon } from "@/components/icons";
import { ProfileMenu } from "@/components/shell/profile-menu";
import { cn } from "@/lib/utils";
import type { ShellData } from "@/lib/shell-data";

const spaceHref = (key: string) => `/spaces/${key.toLowerCase()}`;

/**
 * Everything inside the sidebar. Rendered twice by AppShell: once docked
 * (which turns into the icon rail by CSS, see the `rail:` variant) and once
 * inside the slide-in panel, where it is always full width.
 */

type Props = {
  /** "docked" sits in the page; "overlay" is the slide-in panel. */
  placement: "docked" | "overlay";
  toggleLabel: string;
  toggleExpanded: boolean;
  onToggle: () => void;
  /** Called when a link is followed, so the overlay can close. */
  onNavigate?: () => void;
  /** Narrow widths show an X to close the overlay instead of the sidebar icon. */
  narrow?: boolean;
  data: ShellData;
};

const navLink =
  "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground no-underline hover:bg-navhover hover:text-foreground rail:mx-auto rail:w-11 rail:justify-center rail:px-0";
const navOn =
  "bg-nav-on font-semibold text-foreground shadow-nav-on hover:bg-nav-on aria-[current=page]:bg-nav-on";
const label = "min-w-0 flex-1 truncate rail:hidden";

export function SidebarContent({
  placement,
  toggleLabel,
  toggleExpanded,
  onToggle,
  onNavigate,
  narrow,
  data,
}: Props) {
  const pathname = usePathname();
  const isOn = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = (href: string) => (isOn(href) ? ("page" as const) : undefined);

  return (
    <div
      className={cn(
        "flex min-h-full flex-1 flex-col gap-5 px-3 pt-5 pb-4",
        placement === "docked" && "sb-auto",
      )}
    >
      <div className="flex items-center justify-between gap-2 rail:justify-center">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-2.5 py-0.5 text-lg leading-6 font-semibold tracking-[-0.02em] text-foreground no-underline rail:hidden"
        >
          Capsule
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={toggleExpanded}
          data-nav-toggle={placement}
          className="inline-flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          {narrow ? <X size={16} /> : <SidebarSimple size={16} />}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/new"
          onClick={onNavigate}
          aria-label="New capsule"
          title="New capsule"
          className="inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-full border border-primary bg-primary px-3 text-[13.5px] font-medium text-foreground no-underline hover:border-primary-hover hover:bg-primary-hover rail:mx-auto rail:h-9 rail:w-11 rail:px-0"
        >
          <Plus size={16} />
          <span className="rail:hidden">New capsule</span>
        </Link>
        <button
          type="button"
          title="Search"
          aria-label="Search"
          className="flex h-9 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm text-muted-foreground hover:border-border-strong rail:mx-auto rail:w-11 rail:justify-center rail:px-0"
        >
          <MagnifyingGlass size={16} />
          <span className="flex-1 text-left rail:hidden">Search</span>
          <span className="font-mono text-xs rail:hidden">⌘K</span>
        </button>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={current("/")}
          title="Home"
          className={cn(navLink, isOn("/") && navOn)}
        >
          <House size={16} className="flex-none" />
          <span className={label}>Home</span>
        </Link>
        <Link
          href="/capsules"
          onClick={onNavigate}
          aria-current={current("/capsules")}
          title="Capsules"
          className={cn(navLink, isOn("/capsules") && navOn)}
        >
          <CapsuleIcon size={16} className="flex-none" />
          <span className={label}>Capsules</span>
        </Link>
      </nav>

      <div className="flex flex-col gap-0.5 rail:hidden">
        <h2 className="mb-1 px-2.5 text-xs leading-4 font-medium text-muted-foreground">
          Your spaces
        </h2>
        {data.spaces.map((s) => {
          const href = spaceHref(s.key);
          return (
            <Link
              key={s.key}
              href={href}
              onClick={onNavigate}
              aria-current={current(href)}
              className={cn(navLink, "h-[34px] font-normal text-foreground", isOn(href) && navOn)}
            >
              <span className={label}>{s.name}</span>
            </Link>
          );
        })}
        <Link
          href="/spaces"
          onClick={onNavigate}
          aria-current={pathname === "/spaces" ? "page" : undefined}
          className={cn(navLink, "h-[34px] text-[13px]", pathname === "/spaces" && navOn)}
        >
          <SquaresFour size={16} className="flex-none" />
          Browse spaces
        </Link>
      </div>

      <div className="relative mt-auto border-t border-divider pt-3">
        <ProfileMenu
          onNavigate={onNavigate}
          user={data.user}
          orgName={data.org.name}
          isAdmin={data.org.isAdmin}
        />
      </div>
    </div>
  );
}

/** The slim bar shown under 900px, with the menu button that opens the sidebar. */
export function TopBar({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  return (
    <header className="sticky top-0 z-50 flex h-[57px] flex-none items-center justify-between border-b border-border bg-bg px-4 laptop:hidden">
      <Link
        href="/"
        className="px-2.5 text-lg leading-6 font-semibold tracking-[-0.02em] text-foreground no-underline"
      >
        Capsule
      </Link>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open menu"
        title="Open menu"
        aria-expanded={open}
        data-nav-toggle="topbar"
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-subtle hover:text-foreground"
      >
        <List size={16} />
      </button>
    </header>
  );
}
