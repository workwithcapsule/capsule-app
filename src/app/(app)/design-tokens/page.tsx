import type { Metadata } from "next";
import {
  At,
  CalendarBlank,
  Check,
  GearSix,
  House,
  MagnifyingGlass,
  Paperclip,
  Plus,
  User,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { CapsuleIcon } from "@/components/icons";
import { Page } from "@/components/page";
import { ComponentTag, StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  COMPONENT_COLORS,
  COMPONENT_COLOR_CLASSES,
  DEFAULT_COMPONENT_COLORS,
  STATUSES,
} from "@/lib/design";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design tokens" };

/** Neutral swatches, with the hex values from design-decisions.md and the prototype. */
const NEUTRALS: { name: string; className: string; light: string; dark: string }[] = [
  { name: "Background", className: "bg-bg", light: "#FAF9F7", dark: "#171513" },
  { name: "Surface", className: "bg-surface", light: "#FFFFFF", dark: "#1F1C1A" },
  { name: "Raised", className: "bg-raised", light: "#FCFBFA", dark: "#221F1D" },
  { name: "Subtle", className: "bg-subtle", light: "#F1EEEB", dark: "#2A2623" },
  { name: "Border", className: "bg-border", light: "#E6E1DE", dark: "#3A3532" },
  { name: "Border strong", className: "bg-border-strong", light: "#D2CBC6", dark: "#4A4340" },
  { name: "Primary", className: "bg-primary", light: "#DCD6D2", dark: "#3F3936" },
  { name: "Text", className: "bg-foreground", light: "#2A2523", dark: "#F1ECE8" },
  { name: "Muted text", className: "bg-muted-foreground", light: "#5F5854", dark: "#B3ABA4" },
  { name: "Faint text", className: "bg-faint", light: "#78706B", dark: "#8F8781" },
];

const NAME_FOR_COLOR = Object.fromEntries(
  Object.entries(DEFAULT_COMPONENT_COLORS).map(([name, color]) => [color, name]),
);

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base leading-6 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Panel({ mode }: { mode: "light" | "dark" }) {
  return (
    <div
      className={cn(
        mode,
        "flex min-w-0 flex-1 flex-col gap-7 rounded-2xl border border-border bg-bg p-5 text-foreground laptop:p-6",
      )}
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {mode === "light" ? "Light" : "Dark"}
      </p>

      <Section title="Neutrals">
        <ul className="grid grid-cols-2 gap-2">
          {NEUTRALS.map((n) => (
            <li key={n.name} className="flex items-center gap-2.5">
              <span
                className={cn("size-8 flex-none rounded-lg border border-border", n.className)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] leading-[18px]">{n.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {mode === "light" ? n.light : n.dark}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Component colors">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
          {COMPONENT_COLORS.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("size-2.5 flex-none rounded-full", COMPONENT_COLOR_CLASSES[c].dot)}
              />
              <ComponentTag name={NAME_FOR_COLOR[c] ?? capitalize(c)} color={c} />
              {NAME_FOR_COLOR[c] && (
                <span className="text-xs text-muted-foreground">{capitalize(c)}</span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">Page title</p>
          <p className="text-base leading-6 font-semibold">Section heading</p>
          <p>Body text, Geist 14/20. Launch the partner portal by March.</p>
          <p className="text-[13px] leading-[18px] text-muted-foreground">Small muted text</p>
          <p className="font-mono text-xs">EN-142 · Geist Mono</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Create capsule</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="quiet">Skip for now</Button>
          <Button variant="link">Fill in the fields</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Card and icons">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <ComponentTag name="Tech" color="blue" />
            <span className="flex-1 truncate font-medium">API access for partners</span>
            <StatusPill status="in_progress" />
          </div>
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User size={14} /> Dana
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarBlank size={14} /> Mar 3
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-p-empty">
            <div className="h-full w-3/5 rounded-full bg-p-prog" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-muted-foreground" aria-label="Icon samples">
          {[
            House,
            At,
            MagnifyingGlass,
            Plus,
            GearSix,
            UsersThree,
            Paperclip,
            Check,
            User,
            CalendarBlank,
          ].map((Icon, i) => (
            <Icon key={i} size={20} aria-hidden="true" />
          ))}
          <CapsuleIcon size={20} aria-hidden="true" />
        </div>
      </Section>
    </div>
  );
}

export default function DesignTokensPage() {
  return (
    <Page
      title="Design tokens"
      description="The Stone palette, status pills and component colors, in both modes side by side. This is a check page for the build; it won't be linked anywhere in the product."
      className="max-w-[1200px]"
    >
      <div className="flex flex-col gap-4 wide:flex-row">
        <Panel mode="light" />
        <Panel mode="dark" />
      </div>
    </Page>
  );
}
