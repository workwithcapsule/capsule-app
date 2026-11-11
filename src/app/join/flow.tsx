"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Heading, Nav, Row, ServerError, SetupFrame } from "@/components/setup";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import { cn } from "@/lib/utils";
import { acceptInvitation, finishJoining, setSpaceMembership, updateProfile } from "./actions";
import type { JoinState } from "./types";

/*
 * The invited person's flow (design-decisions.md section 5, v1-scope.md):
 * confirm your profile and usual areas, see your spaces and the capsules
 * that already have something for you, then the welcome animation and Home.
 */

const STEPS = ["Your profile", "Your spaces"];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function JoinFlow({ initial }: { initial: JoinState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(initial);
  const [step, setStep] = useState(initial.stage === "joining" ? 2 : 1);
  const [furthest, setFurthest] = useState(step);
  const [name, setName] = useState(initial.yourName);
  const [areas, setAreas] = useState<string[]>(initial.areas);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");

  const nameError = name.trim() ? "" : "Enter your name.";
  const firstInitial = (name.trim() || state.email).charAt(0).toUpperCase();

  function go(n: number) {
    setError("");
    setStep(n);
    setFurthest((f) => Math.max(f, n));
    window.scrollTo({ top: 0 });
  }

  function continueProfile() {
    setTried(true);
    if (nameError) return;
    setError("");
    start(async () => {
      if (state.stage === "invited") {
        const r = await acceptInvitation(name, areas);
        if (!r.ok) return setError(r.error);
        if (r.state) setState(r.state);
      } else {
        const r = await updateProfile(state.orgId!, name, areas);
        if (!r.ok) return setError(r.error);
      }
      go(2);
    });
  }

  function toggleSpace(id: string, join: boolean) {
    setError("");
    setState((s) => ({
      ...s,
      spaces: s.spaces.map((x) =>
        x.id === id ? { ...x, joined: join, members: x.members + (join ? 1 : -1) } : x,
      ),
    }));
    start(async () => {
      const r = await setSpaceMembership(state.orgId!, id, join);
      if (!r.ok) {
        setError(r.error);
        setState((s) => ({
          ...s,
          spaces: s.spaces.map((x) =>
            x.id === id ? { ...x, joined: !join, members: x.members + (join ? -1 : 1) } : x,
          ),
        }));
      }
    });
  }

  let body: React.ReactNode;

  if (step === 1) {
    body = (
      <>
        <span className="text-xs text-muted-foreground">
          {state.invitedBy} invited you to {state.orgName}
        </span>
        <Heading title="Welcome to Capsule">
          Confirm a few details so teammates know who you are.
        </Heading>
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-avatar-me text-xl font-semibold"
          >
            {firstInitial}
          </span>
          <span className="text-[13px] text-muted-foreground">
            You can add a photo later in Settings.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="jn-name">Name</Label>
          <Input
            id="jn-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={tried && nameError ? true : undefined}
          />
          <FieldError>{tried ? nameError : ""}</FieldError>
        </div>
        {state.components.length > 0 && (
          <div className="flex flex-col gap-2">
            <span id="jn-areas" className="text-[13px] leading-[18px] font-medium">
              Which areas do you usually work in?
            </span>
            <div role="group" aria-labelledby="jn-areas" className="flex flex-wrap gap-1.5">
              {state.components.map((c) => {
                const on = areas.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setAreas((a) => (on ? a.filter((x) => x !== c.id) : [...a, c.id]))
                    }
                    className={cn(
                      "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[13px]",
                      on ? "border-primary bg-primary" : "border-border bg-bg hover:bg-subtle",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-2 rounded-full", COMPONENT_COLOR_CLASSES[c.color].dot)}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              Helps Capsule suggest you as an owner when new capsules are created.
            </span>
          </div>
        )}
        <ServerError message={error} />
        <Nav onNext={continueProfile} label="Continue" pending={pending} />
      </>
    );
  } else {
    const withWork = state.spaces.flatMap((s) => s.capsules).length;
    body = (
      <>
        <Heading title="Here’s where you’ll work">
          {withWork > 0
            ? `${state.invitedBy} invited you to ${state.orgName}. ${
                withWork === 1 ? "A capsule already has" : "A few capsules already have"
              } something for you.`
            : `These are ${state.orgName}’s spaces. Join the ones you work in to keep them in your sidebar.`}
        </Heading>
        {state.spaces.length === 0 && (
          <Card className="px-5 py-4 text-muted-foreground">
            {state.orgName} doesn’t have any spaces yet. You can create one from Browse spaces.
          </Card>
        )}
        {state.spaces.map((s) => (
          <Card key={s.id}>
            <Row>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  Public · {plural(s.members, "member")}
                </span>
              </span>
              <Button
                variant={s.joined ? "secondary" : "primary"}
                className="group min-w-[84px]"
                disabled={pending}
                aria-pressed={s.joined}
                aria-label={s.joined ? `Leave ${s.name}` : `Join ${s.name}`}
                onClick={() => toggleSpace(s.id, !s.joined)}
              >
                {s.joined ? (
                  <>
                    <span className="group-hover:hidden">Joined</span>
                    <span className="hidden group-hover:inline">Leave</span>
                  </>
                ) : (
                  "Join"
                )}
              </Button>
            </Row>
            {s.capsules.map((c) => (
              <Row key={c.id}>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">{c.role}</span>
                </span>
                {c.needs > 0 && (
                  <span className="inline-flex h-6 flex-none items-center rounded-full bg-subtle px-2.5 text-xs font-medium">
                    {c.needs} need{c.needs === 1 ? "s" : ""} you
                  </span>
                )}
              </Row>
            ))}
          </Card>
        ))}
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          You can browse and join other public spaces anytime.
        </span>
        <ServerError message={error} />
        <Nav
          onBack={() => go(1)}
          onNext={() =>
            start(async () => {
              const r = await finishJoining(state.orgId!);
              if (!r.ok) return setError(r.error);
              router.push("/welcome");
            })
          }
          label="Finish"
          pending={pending}
        />
      </>
    );
  }

  return (
    <SetupFrame
      label="GET STARTED"
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
