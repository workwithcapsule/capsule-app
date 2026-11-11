"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { CaretUpDown, GearSix, Monitor, Moon, SignOut, Sun } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ShellData } from "@/lib/shell-data";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
] as const;

/** The profile button at the foot of the sidebar, with Settings and Appearance. */
export function ProfileMenu({
  onNavigate,
  user,
  orgName,
}: {
  onNavigate?: () => void;
  user: ShellData["user"];
  orgName: string;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        title={user.name}
        className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-foreground outline-offset-2 hover:bg-navhover data-[state=open]:bg-navhover rail:mx-auto rail:w-11 rail:justify-center rail:px-0"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-avatar-me text-xs font-semibold text-foreground"
        >
          {user.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col rail:hidden">
          <span className="truncate">{user.name}</span>
          <span className="truncate text-xs leading-4 font-normal text-muted-foreground">
            {orgName}
          </span>
        </span>
        <CaretUpDown size={14} className="flex-none text-faint rail:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        aria-label="Account"
        className="w-[max(var(--radix-dropdown-menu-trigger-width),236px)]"
      >
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <GearSix size={16} />
            Settings
          </Link>
        </DropdownMenuItem>
        <div
          role="group"
          aria-label="Appearance"
          className="flex h-10 items-center gap-2.5 pr-1 pl-2.5"
        >
          <Moon size={16} aria-hidden="true" />
          <span className="flex-1">Appearance</span>
          <span className="inline-flex gap-0.5 rounded-full bg-subtle p-0.5">
            {THEMES.map(({ value, label, Icon }) => (
              <DropdownMenuItem
                key={value}
                aria-label={label}
                title={label}
                aria-checked={theme === value}
                role="menuitemradio"
                onSelect={(e) => {
                  e.preventDefault();
                  setTheme(value);
                }}
                className={cn(
                  "h-6 w-[26px] justify-center rounded-full p-0 text-muted-foreground data-[highlighted]:bg-transparent data-[highlighted]:text-foreground data-[highlighted]:outline-2 data-[highlighted]:outline-focus",
                  theme === value &&
                    "bg-seg-on text-foreground shadow-seg-on data-[highlighted]:bg-seg-on",
                )}
              >
                <Icon size={13} />
              </DropdownMenuItem>
            ))}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const form = document.createElement("form");
            form.method = "post";
            form.action = "/auth/signout";
            document.body.appendChild(form);
            form.submit();
          }}
        >
          <SignOut size={16} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
