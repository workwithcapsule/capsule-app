"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Check, Copy, Monitor, Moon, Sparkle, Sun, X } from "@phosphor-icons/react";
import { ColorIconPicker } from "@/components/color-icon-picker";
import { AddLine, Card, Row } from "@/components/setup";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { nextColor, SUGGESTED_COMPONENTS } from "@/lib/component-catalog";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  disconnectApp,
  disconnectJira,
  saveName,
  saveOrgComponents,
  setEmailNotifications,
} from "./actions";
import type { ConnectedApp, JiraConnection, SettingsComponent } from "./types";

type Tab = "profile" | "appearance" | "apps" | "components";

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

/**
 * Settings (step 11). Shows only what you can change (design-decisions.md
 * section 14): Org components appear for org admins only.
 */
export function SettingsView(props: {
  initialTab: Tab;
  name: string;
  email: string;
  emailNotifications: boolean;
  orgId: string | null;
  isAdmin: boolean;
  components: SettingsComponent[];
  mcpUrl: string;
  apps: ConnectedApp[];
  jira: JiraConnection;
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const tabs: [Tab, string][] = [
    ["profile", "Profile"],
    ["appearance", "Appearance"],
    ["apps", "Connected apps"],
    ...(props.isAdmin ? ([["components", "Org components"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div
        role="tablist"
        aria-label="Settings"
        className="flex gap-1 border-b border-divider max-sm:overflow-x-auto max-sm:overflow-y-hidden"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => {
              setTab(id);
              window.history.replaceState(
                null,
                "",
                id === "profile" ? "/settings" : `/settings?tab=${id}`,
              );
            }}
            className={cn(
              "-mb-px h-10 flex-none border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === id && "border-foreground text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "profile" && <Profile {...props} />}
        {tab === "appearance" && <Appearance />}
        {tab === "apps" && (
          <ConnectedApps mcpUrl={props.mcpUrl} initial={props.apps} jira={props.jira} />
        )}
        {tab === "components" && props.orgId && (
          <OrgComponents orgId={props.orgId} initial={props.components} />
        )}
      </div>
    </div>
  );
}

function Profile({
  name: initialName,
  email,
  emailNotifications,
}: {
  name: string;
  email: string;
  emailNotifications: boolean;
}) {
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [on, setOn] = useState(emailNotifications);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="profile-h" className="flex flex-col gap-4">
        <h2 id="profile-h" className="sr-only">
          Profile
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-name">Your name</Label>
          <div className="flex gap-2">
            <Input
              id="s-name"
              className="h-10 flex-1"
              maxLength={120}
              value={name}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
            <Button
              variant={name.trim() !== saved ? "primary" : "secondary"}
              disabled={pending || name.trim() === saved}
              onClick={() =>
                start(async () => {
                  const r = await saveName(name);
                  if (!r.ok) return setError(r.error);
                  setSaved(name.trim());
                  toast("Name saved.");
                })
              }
            >
              Save
            </Button>
          </div>
          <FieldError>{error}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] leading-[18px] font-medium">Work email</span>
          <span className="flex h-10 items-center rounded-[10px] border border-border bg-subtle px-3 text-sm text-muted-foreground">
            {email}
          </span>
          <span className="text-xs text-muted-foreground">
            You sign in with this address. It can’t be changed here.
          </span>
        </div>
      </section>

      <section aria-labelledby="notify-h" className="flex flex-col gap-2">
        <h2 id="notify-h" className="text-base leading-6 font-semibold">
          Email notifications
        </h2>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Email me when I’m made an owner, assigned work or @mentioned
            </span>
            <span className="text-[13px] text-muted-foreground">
              Sent a few seconds after the change, from Christina from Capsule.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Email notifications"
            onClick={() => {
              const next = !on;
              setOn(next);
              start(async () => {
                const r = await setEmailNotifications(next);
                if (!r.ok) {
                  setOn(!next);
                  toast(r.error);
                  return;
                }
                toast(next ? "Notification emails are on." : "Notification emails are off.");
              });
            }}
            className={cn(
              "relative mt-0.5 inline-flex h-6 w-10 flex-none rounded-full transition-colors motion-reduce:transition-none",
              on ? "bg-foreground" : "bg-border-strong",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none",
                on ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </button>
        </label>
      </section>
    </div>
  );
}

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
] as const;

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <section aria-labelledby="appearance-h" className="flex flex-col gap-3">
      <h2 id="appearance-h" className="text-base leading-6 font-semibold">
        Appearance
      </h2>
      <div
        role="radiogroup"
        aria-labelledby="appearance-h"
        className="grid gap-3 min-[560px]:grid-cols-3"
      >
        {THEMES.map(({ value, label, Icon }) => {
          const on = (theme ?? "system") === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl border bg-surface p-4 text-left text-sm font-medium shadow-card",
                on ? "border-foreground" : "border-border hover:border-border-strong",
              )}
            >
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {on && <Check size={14} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OrgComponents({ orgId, initial }: { orgId: string; initial: SettingsComponent[] }) {
  const toast = useToast();
  const [components, setComponents] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(components) !== saved;
  const names = components.map((c) => c.name.trim().toLowerCase());
  const suggestions = SUGGESTED_COMPONENTS.filter((s) => !names.includes(s.name.toLowerCase()));

  const update = (key: string, patch: Partial<SettingsComponent>) =>
    setComponents((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  function add(name: string) {
    const known = SUGGESTED_COMPONENTS.find(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
    );
    setComponents((list) => [
      ...list,
      known
        ? { ...known, key: newKey() }
        : {
            key: newKey(),
            name: name.trim(),
            description: "",
            color: nextColor(list.map((c) => c.color)),
            icon: "box",
          },
    ]);
  }

  return (
    <section aria-labelledby="comps-h" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="comps-h" className="text-base leading-6 font-semibold">
          Org components
        </h2>
        <p className="text-[13px] text-muted-foreground">
          The functions every capsule is built from. Removing one only stops it being offered for
          new capsules; capsules that already have it keep it.
        </p>
      </div>
      {components.length > 0 && (
        <Card>
          {components.map((c) => (
            <Row key={c.key} className="items-start">
              <ColorIconPicker
                name={c.name}
                color={c.color}
                icon={c.icon}
                onColor={(color) => update(c.key, { color })}
                onIcon={(icon) => update(c.key, { icon })}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={`sn-${c.key}`} className="sr-only">
                  Component name
                </label>
                <Input
                  id={`sn-${c.key}`}
                  size="sm"
                  className="w-full font-semibold"
                  maxLength={60}
                  value={c.name}
                  onChange={(e) => update(c.key, { name: e.target.value })}
                  aria-invalid={!c.name.trim() ? true : undefined}
                />
                <label htmlFor={`sd-${c.key}`} className="sr-only">
                  Description for {c.name}
                </label>
                <Input
                  id={`sd-${c.key}`}
                  size="sm"
                  className="w-full border-transparent text-muted-foreground hover:border-border"
                  placeholder="Add a description"
                  value={c.description}
                  onChange={(e) => update(c.key, { description: e.target.value })}
                />
              </span>
              <Button
                variant="quiet"
                size="icon"
                aria-label={`Remove ${c.name || "component"}`}
                onClick={() => setComponents((list) => list.filter((x) => x.key !== c.key))}
              >
                <X size={14} />
              </Button>
            </Row>
          ))}
        </Card>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => add(s.name)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-bg px-3 text-[13px] hover:bg-subtle"
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
      <AddLine
        id="s-cd"
        label="Add your own component"
        value={draft}
        onChange={setDraft}
        onAdd={() => {
          if (draft.trim()) add(draft);
          setDraft("");
        }}
      />
      <FieldError>{error}</FieldError>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await saveOrgComponents(orgId, components);
              if (!r.ok) return setError(r.error);
              setSaved(JSON.stringify(components));
              toast("Org components saved.");
            })
          }
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {dirty && (
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() => {
              setComponents(JSON.parse(saved));
              setError("");
            }}
          >
            Discard
          </Button>
        )}
      </div>
    </section>
  );
}

/** "Just now" → "just now", mid-sentence. */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * AI apps (Claude, ChatGPT, ...) the person has connected (step 13), with
 * the address to connect one and a way to disconnect each.
 */
function ConnectedApps({
  mcpUrl,
  initial,
  jira,
}: {
  mcpUrl: string;
  initial: ConnectedApp[];
  jira: JiraConnection;
}) {
  const toast = useToast();
  const [apps, setApps] = useState(initial);
  const [jiraOn, setJiraOn] = useState(jira.connected);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="mcp-h" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="mcp-h" className="text-base leading-6 font-semibold">
            Use Capsule from your AI apps
          </h2>
          <p className="text-sm text-muted-foreground">
            Add Capsule as a connector in Claude, ChatGPT or any app that supports MCP, then ask
            things like “What needs me in Capsule today?” The app works as you, with your
            permissions, and its changes show as yours via the app.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mcp-url">Connector address</Label>
          <div className="flex gap-2">
            <Input
              id="mcp-url"
              readOnly
              value={mcpUrl}
              className="h-10 flex-1 font-mono text-[13px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="md"
              className="h-10"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(mcpUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  toast("Couldn’t copy. Select the address and copy it.");
                }
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            In Claude: Settings → Connectors → Add custom connector, then paste this address and
            sign in to Capsule when asked.
          </span>
        </div>
      </section>

      <section aria-labelledby="apps-h" className="flex flex-col gap-3">
        <h2 id="apps-h" className="text-base leading-6 font-semibold">
          Connected apps
        </h2>
        {apps.length ? (
          <Card>
            {apps.map((a) => (
              <Row key={a.clientId}>
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-c-purple text-c-purple-fg"
                  >
                    <Sparkle size={16} weight="fill" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                      Connected {lower(fmtRelative(a.connectedAt))}
                      {a.lastUsedAt && ` · last used ${lower(fmtRelative(a.lastUsedAt))}`}
                    </span>
                  </span>
                </span>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await disconnectApp(a.clientId);
                      if (!r.ok) return toast(r.error);
                      setApps((list) => list.filter((x) => x.clientId !== a.clientId));
                      toast(`Disconnected ${a.name}. Connect it again from ${a.name} any time.`);
                    })
                  }
                >
                  Disconnect
                </Button>
              </Row>
            ))}
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            No AI apps are connected yet. Once you connect one, it shows here, and you can
            disconnect it at any time.
          </p>
        )}
      </section>

      {jira.configured && (
        <section aria-labelledby="work-h" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="work-h" className="text-base leading-6 font-semibold">
              Work tools
            </h2>
            <p className="text-sm text-muted-foreground">
              Link Jira issues to work items. Capsule only reads from Jira, with your own account,
              and never changes anything there.
            </p>
          </div>
          <Card>
            <Row>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">Jira</span>
                <span className="truncate text-xs text-muted-foreground">
                  {jiraOn
                    ? jira.reconnect
                      ? "Jira stopped accepting the connection. Connect again."
                      : `Connected${jira.accountName ? ` as ${jira.accountName}` : ""}${
                          jira.siteName ? ` · ${jira.siteName}` : ""
                        }`
                    : "Not connected"}
                </span>
              </span>
              {jiraOn && !jira.reconnect ? (
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await disconnectJira();
                      if (!r.ok) return toast(r.error);
                      setJiraOn(false);
                      toast("Disconnected Jira. Linked items keep their last details.");
                    })
                  }
                >
                  Disconnect
                </Button>
              ) : (
                <Button asChild variant="primary">
                  <a
                    href={`/api/integrations/jira/connect?next=${encodeURIComponent("/settings?tab=apps")}`}
                  >
                    Connect Jira
                  </a>
                </Button>
              )}
            </Row>
          </Card>
        </section>
      )}
    </div>
  );
}
