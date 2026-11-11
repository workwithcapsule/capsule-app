"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "@phosphor-icons/react";
import { ColorIconPicker } from "@/components/color-icon-picker";
import { AddLine, Card, Heading, Nav, Row, ServerError, SetupFrame } from "@/components/setup";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { COMPONENT_COLORS, type ComponentColor } from "@/lib/design";
import { isEmail, parseInvites, prefixError, suggestPrefix } from "@/lib/validation";
import { finishOnboarding, saveAccount, saveComponents, saveSpaces, saveStep } from "./actions";
import type { OnboardingComponent, OnboardingState } from "./types";

/*
 * Onboarding for the first person in an org (design-decisions.md sections 5
 * and 14, V1 limits from v1-scope.md). Copy follows docs/prototype.html.
 */

const STEPS = ["Your account", "Components", "Spaces", "Connect tools", "Invite teammates"];

/** Components offered as one-click additions (prototype ORG_COMPS). */
const SUGGESTED: Omit<OnboardingComponent, "key">[] = [
  { name: "Tech", color: "blue", icon: "code", description: "Engineering, QA and release work." },
  {
    name: "Operations",
    color: "teal",
    icon: "cycle",
    description: "Readiness, process and support handoff.",
  },
  {
    name: "Sales",
    color: "green",
    icon: "chart",
    description: "Enablement, training and customer comms.",
  },
  {
    name: "Marketing",
    color: "orange",
    icon: "megaphone",
    description: "Messaging, launch content and campaigns.",
  },
  {
    name: "Support",
    color: "amber",
    icon: "headset",
    description: "Macros, docs and support readiness.",
  },
  { name: "Compliance", color: "purple", icon: "shield", description: "Reviews and sign-offs." },
  { name: "Legal", color: "gray", icon: "scale", description: "Contracts, terms and approvals." },
  { name: "Design", color: "pink", icon: "pen", description: "UX, visuals and research." },
  {
    name: "Finance",
    color: "olive",
    icon: "wallet",
    description: "Budget, pricing and forecasting.",
  },
];

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Custom components get the next color not already in use. */
function nextColor(used: ComponentColor[]): ComponentColor {
  return COMPONENT_COLORS.find((c) => !used.includes(c)) ?? "gray";
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

export function OnboardingFlow({ initial }: { initial: OnboardingState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orgId, setOrgId] = useState(initial.org?.id ?? null);
  const [step, setStep] = useState(initial.org ? Math.max(2, initial.org.step) : 1);
  const [furthest, setFurthest] = useState(step);
  const [serverError, setServerError] = useState("");

  const [yourName, setYourName] = useState(initial.yourName);
  const [orgName, setOrgName] = useState(initial.org?.name ?? "");
  const [triedAccount, setTriedAccount] = useState(false);

  const [components, setComponents] = useState(initial.components);
  const [componentDraft, setComponentDraft] = useState("");

  const [spaces, setSpaces] = useState(initial.spaces);
  const [spaceDraft, setSpaceDraft] = useState("");

  const [invites, setInvites] = useState(initial.invites);
  const [inviteDraft, setInviteDraft] = useState("");

  const firstName = yourName.trim().split(/\s+/)[0] || "you";

  function go(to: number) {
    setServerError("");
    setStep(to);
    setFurthest((f) => Math.max(f, to));
    window.scrollTo({ top: 0 });
  }

  function run(task: () => Promise<{ ok: boolean; error?: string }>, then: () => void) {
    setServerError("");
    startTransition(async () => {
      const result = await task();
      if (result.ok) then();
      else setServerError(result.error ?? "Something went wrong. Try again.");
    });
  }

  // Step 1 ------------------------------------------------------------------
  const nameError = !yourName.trim() ? "Enter your name." : "";
  const orgError = !orgName.trim() ? "Enter your organization’s name." : "";

  function continueAccount() {
    setTriedAccount(true);
    if (nameError || orgError) return;
    run(
      async () => {
        const r = await saveAccount({ orgId, yourName, orgName });
        if (r.ok && r.orgId) {
          setOrgId(r.orgId);
          // A brand-new org starts with the default components.
          if (r.components) setComponents(r.components);
        }
        return r;
      },
      () => go(2),
    );
  }

  // Step 2 ------------------------------------------------------------------
  const componentNames = components.map((c) => c.name.trim().toLowerCase());
  const componentError = components.some((c) => !c.name.trim())
    ? "Give every component a name."
    : new Set(componentNames).size !== componentNames.length
      ? "Two components can’t have the same name."
      : components.length === 0
        ? "Keep at least one component."
        : "";
  const suggestions = SUGGESTED.filter((s) => !componentNames.includes(s.name.toLowerCase()));

  function updateComponent(key: string, patch: Partial<OnboardingComponent>) {
    setComponents((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function addComponent(name: string) {
    const known = SUGGESTED.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
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

  // Step 3 ------------------------------------------------------------------
  const prefixes = spaces.map((s) => s.prefix.trim().toUpperCase());
  const spaceErrors = spaces.map((s, i) =>
    prefixError(
      s.prefix,
      prefixes.filter((_, j) => j !== i),
    ),
  );

  function addSpace() {
    const name = spaceDraft.trim();
    if (!name) return;
    setSpaces((list) => [...list, { key: newKey(), name, prefix: suggestPrefix(name, prefixes) }]);
    setSpaceDraft("");
  }

  // Step 5 ------------------------------------------------------------------
  const inviteCheck = inviteDraft.trim() ? parseInvites(inviteDraft, invites) : null;
  const domain = initial.email.split("@")[1] ?? "company.com";

  function addInvites() {
    if (!inviteCheck || inviteCheck.error) return;
    setInvites((list) => [...list, ...inviteCheck.emails]);
    setInviteDraft("");
  }

  // ---------------------------------------------------------------------------

  let body: React.ReactNode;

  if (step === 1) {
    body = (
      <>
        <Heading title="Set up Capsule for your team">
          A few minutes now, and every capsule after this gets set up for you.
        </Heading>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ob-you">Your name</Label>
          <Input
            id="ob-you"
            autoComplete="name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            aria-invalid={triedAccount && nameError ? true : undefined}
          />
          <FieldError>{triedAccount ? nameError : ""}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ob-mail">Work email</Label>
          <Input id="ob-mail" value={initial.email} readOnly className="text-muted-foreground" />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check size={12} aria-hidden="true" /> Confirmed when you signed in
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ob-org">Organization name</Label>
          <Input
            id="ob-org"
            autoComplete="organization"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            aria-invalid={triedAccount && orgError ? true : undefined}
          />
          <FieldError>{triedAccount ? orgError : ""}</FieldError>
        </div>
        <ServerError message={serverError} />
        <Nav onNext={continueAccount} label="Continue" pending={pending} />
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <Heading title={`How does ${orgName.trim() || "your org"} split up work?`}>
          Components are the functions every capsule is built from. Start with these, rename them to
          match your teams, or add your own. You can change them later in org settings.
        </Heading>
        {components.length > 0 && (
          <Card>
            {components.map((c) => (
              <Row key={c.key} className="items-start">
                <ColorIconPicker
                  name={c.name}
                  color={c.color}
                  icon={c.icon}
                  onColor={(color) => updateComponent(c.key, { color })}
                  onIcon={(icon) => updateComponent(c.key, { icon })}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor={`obn-${c.key}`} className="sr-only">
                    Component name
                  </label>
                  <Input
                    id={`obn-${c.key}`}
                    size="sm"
                    className="w-full font-semibold"
                    value={c.name}
                    onChange={(e) => updateComponent(c.key, { name: e.target.value })}
                    aria-invalid={!c.name.trim() ? true : undefined}
                  />
                  <label htmlFor={`obd-${c.key}`} className="sr-only">
                    Description for {c.name}
                  </label>
                  <Input
                    id={`obd-${c.key}`}
                    size="sm"
                    className="w-full border-transparent text-muted-foreground hover:border-border"
                    placeholder="Add a description"
                    value={c.description}
                    onChange={(e) => updateComponent(c.key, { description: e.target.value })}
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
                onClick={() => addComponent(s.name)}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-bg px-3 text-[13px] hover:bg-subtle"
              >
                + {s.name}
              </button>
            ))}
          </div>
        )}
        <AddLine
          id="ob-cd"
          label="Add your own component"
          value={componentDraft}
          onChange={setComponentDraft}
          onAdd={() => {
            addComponent(componentDraft);
            setComponentDraft("");
          }}
        />
        <FieldError>{componentError}</FieldError>
        <ServerError message={serverError} />
        <Nav
          onBack={() => go(1)}
          onNext={() =>
            run(
              () => saveComponents(orgId!, components),
              () => go(3),
            )
          }
          label={`Continue with ${plural(components.length, "component")}`}
          blocked={Boolean(componentError)}
          pending={pending}
        />
      </>
    );
  } else if (step === 3) {
    const draftPrefix = spaceDraft.trim() ? suggestPrefix(spaceDraft.trim(), prefixes) : "";
    body = (
      <>
        <Heading title="Create your first spaces">
          Spaces group capsules by team, product or program. Each capsule lives in one space, and
          anyone can still be added to any capsule. You can skip this and add spaces later.
        </Heading>
        {spaces.length > 0 && (
          <Card>
            {spaces.map((s, i) => (
              <Row key={s.key} className="flex-wrap">
                <span className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="font-medium">{s.name}</span>
                    <span className="flex items-center gap-1.5">
                      <label htmlFor={`obp-${s.key}`} className="text-xs text-muted-foreground">
                        Key prefix
                      </label>
                      <Input
                        id={`obp-${s.key}`}
                        size="sm"
                        className="w-16 font-mono uppercase"
                        maxLength={4}
                        value={s.prefix}
                        readOnly={Boolean(s.id)}
                        title={s.id ? "Saved key prefixes can’t change" : undefined}
                        onChange={(e) =>
                          setSpaces((list) =>
                            list.map((x) =>
                              x.key === s.key ? { ...x, prefix: e.target.value.toUpperCase() } : x,
                            ),
                          )
                        }
                        aria-invalid={spaceErrors[i] ? true : undefined}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {s.prefix.trim().toUpperCase() || "??"}-1
                      </span>
                    </span>
                  </span>
                  <FieldError>{spaceErrors[i]}</FieldError>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Public · anyone can join</span>
                  {!s.id && (
                    <Button
                      variant="quiet"
                      size="icon"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => setSpaces((list) => list.filter((x) => x.key !== s.key))}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </span>
              </Row>
            ))}
          </Card>
        )}
        <AddLine
          id="ob-sd"
          label="New space name"
          value={spaceDraft}
          onChange={setSpaceDraft}
          onAdd={addSpace}
        />
        {draftPrefix && (
          <span className="-mt-1 text-xs text-muted-foreground">
            Suggested key prefix: <b className="font-mono text-foreground">{draftPrefix}</b>. You
            can change it after adding.
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          The key prefix starts every capsule key in that space, like EN-1. Anyone can create a
          public space later.
        </span>
        <ServerError message={serverError} />
        <Nav
          onBack={() => go(2)}
          onNext={() =>
            run(
              () => saveSpaces(orgId!, spaces),
              () => go(4),
            )
          }
          label={spaces.length ? `Continue with ${plural(spaces.length, "space")}` : "Skip for now"}
          blocked={spaceErrors.some(Boolean)}
          pending={pending}
        />
      </>
    );
  } else if (step === 4) {
    const soon = (
      <span className="inline-flex h-6 flex-none items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-muted-foreground">
        Coming soon
      </span>
    );
    body = (
      <>
        <Heading title="Connect the tools your teams already use">
          Teams keep working where they are. Capsule pulls in status, owners and dates so nobody
          updates the same thing twice.
        </Heading>
        <h2 className="mt-2 text-base leading-6 font-semibold">Work tools</h2>
        <Card>
          {[
            ["Jira", "For engineering and technical work."],
            ["monday.com", "For business team boards and workflows."],
          ].map(([name, blurb]) => (
            <Row key={name}>
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-lg bg-subtle text-[13px] font-semibold text-muted-foreground"
                >
                  {name[0].toUpperCase()}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{name}</span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">{blurb}</span>
                </span>
              </span>
              {soon}
            </Row>
          ))}
        </Card>
        <h2 className="mt-3 text-base leading-6 font-semibold">AI tools</h2>
        <p className="text-muted-foreground">
          You don’t set up agents inside Capsule. Connect the AI app you already use, and it can
          read your capsules, update work and hand things back for review.
        </p>
        <Card className="flex flex-col gap-2.5 px-5 py-4">
          <span className="text-xs font-semibold tracking-[0.04em] text-muted-foreground">
            EVERY AGENT ACTION IS LABELED
          </span>
          <span className="flex items-center gap-3">
            <span aria-hidden="true" className="relative size-8 flex-none">
              <span className="absolute top-0 left-0 flex size-6 items-center justify-center rounded-full bg-avatar-me text-[11px] font-semibold">
                {firstName[0]?.toUpperCase()}
              </span>
              <span className="absolute right-0 bottom-0 size-5 rounded-full bg-foreground shadow-[0_0_0_2px_var(--surface)]" />
            </span>
            <span className="flex flex-col">
              <span>
                <b className="font-semibold">Claude</b>, on behalf of {firstName}, drafted the
                enablement guide
              </span>
              <span className="text-xs text-muted-foreground">
                Partner leaderboard launch · Sales · just now
              </span>
            </span>
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            Agents act with your permissions, never as you. Approvals, releases and scope changes
            still come to a person.
          </span>
        </Card>
        <Card>
          {[
            ["Claude", "Add Capsule as a connector, then sign in once to approve it."],
            ["ChatGPT", "Add Capsule as an app, then sign in once to approve it."],
          ].map(([name, blurb]) => (
            <Row key={name}>
              <span className="flex flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">{blurb}</span>
              </span>
              {soon}
            </Row>
          ))}
        </Card>
        <span className="text-xs text-muted-foreground">Works with any app that supports MCP.</span>
        <ServerError message={serverError} />
        <Nav
          onBack={() => go(3)}
          onNext={() =>
            run(
              () => saveStep(orgId!, 5),
              () => go(5),
            )
          }
          label="Continue"
          pending={pending}
        />
      </>
    );
  } else {
    const inviteError = inviteCheck?.error ?? "";
    body = (
      <>
        <Heading title="Invite your teammates">
          Capsule works best when the people doing the work are in it. They’ll only see capsules
          they’re added to or can follow.
        </Heading>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <label htmlFor="ob-inv" className="sr-only">
              Email addresses
            </label>
            <Input
              id="ob-inv"
              placeholder={`name@${domain}`}
              value={inviteDraft}
              onChange={(e) => setInviteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInvites();
                }
              }}
              aria-invalid={inviteError ? true : undefined}
              aria-describedby={inviteError ? "inv-err" : "inv-hint"}
            />
            <Button
              variant={inviteDraft.trim() && !inviteError ? "primary" : "secondary"}
              size="lg"
              disabled={!inviteDraft.trim() || Boolean(inviteError)}
              onClick={addInvites}
            >
              Add
            </Button>
          </div>
          {inviteError ? (
            <FieldError id="inv-err">{inviteError}</FieldError>
          ) : (
            <span id="inv-hint" className="text-xs text-muted-foreground">
              Separate several addresses with commas.
            </span>
          )}
        </div>
        {invites.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="People to invite">
            {invites.map((email) => (
              <li
                key={email}
                className="group inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-surface pr-1.5 pl-3 text-[13px]"
              >
                {email}
                <button
                  type="button"
                  aria-label={`Remove ${email}`}
                  onClick={() => setInvites((list) => list.filter((x) => x !== email))}
                  className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-subtle hover:text-foreground focus-visible:opacity-100"
                >
                  <X size={10} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ServerError message={serverError} />
        <Nav
          onBack={() => go(4)}
          onNext={() =>
            run(
              () => finishOnboarding(orgId!, invites.filter(isEmail)),
              () => router.push("/welcome"),
            )
          }
          label={invites.length ? "Send invites and finish" : "Finish"}
          pending={pending}
        />
      </>
    );
  }

  return (
    <SetupFrame
      label="SET UP YOUR ORGANIZATION"
      steps={STEPS}
      step={step}
      furthest={furthest}
      onGo={go}
      disabled={pending}
    >
      {body}
    </SetupFrame>
  );
}
