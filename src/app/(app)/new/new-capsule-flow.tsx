"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowUp, Warning } from "@phosphor-icons/react";
import { guessComponents } from "@/lib/ai/guess";
import type { ShapedDraft } from "@/lib/ai/types";
import type { ComponentType, PersonRef } from "@/lib/capsule-types";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import { cn } from "@/lib/utils";
import { shape } from "./actions";
import { NewCapsuleForm, type SpaceOption } from "./new-capsule-form";
import { Orbit, type Bead } from "./orbit";

/*
 * New capsule (step 9): Describe → Orbit while Claude shapes it → Review.
 * "Fill in the fields" skips straight to the form. Reduced motion skips
 * Orbit and fades to the review (CLAUDE.md "Orbit").
 */

export const TRY = [
  [
    "Fix a production bug",
    "Fix the duplicate payout notification bug before the next payout run on Friday",
  ],
  [
    "Roll out a new policy",
    "Roll out the updated data retention policy to all teams by end of quarter, with legal review",
  ],
  [
    "Launch a program",
    "Launch the partner referral program to our sales team by mid-January, with a training session for reps",
  ],
] as const;

/** Home's examples (prototype homeScreen): the third one is about a feature. */
export const HOME_TRY = [
  TRY[0],
  TRY[1],
  [
    "Launch a feature to customers",
    "Launch the partner leaderboard to customers by end of month, with docs and an announcement",
  ],
] as const;

const PHASES = [
  "Reading your outcome",
  "Matching your org’s components",
  "Suggesting dates and first work items",
];

type Step =
  | { kind: "describe"; error?: string; canRetry?: boolean }
  | { kind: "shaping"; from: DOMRect | null }
  | { kind: "review"; draft: ShapedDraft; requestId: string }
  | { kind: "scratch"; outcome: string };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function NewCapsuleFlow({
  spaces,
  people,
  types,
  me,
  defaultSpaceId,
  aiReady,
  initialPrompt,
  autoStart,
  startScratch,
}: {
  spaces: SpaceOption[];
  people: PersonRef[];
  types: ComponentType[];
  me: PersonRef;
  defaultSpaceId: string | null;
  aiReady: boolean;
  initialPrompt: string;
  /** Sent from Home (or an example link): start shaping straight away. */
  autoStart: boolean;
  startScratch: boolean;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [step, setStep] = useState<Step>(
    startScratch ? { kind: "scratch", outcome: "" } : { kind: "describe" },
  );
  const [, startTransition] = useTransition();
  const [orbiting, setOrbiting] = useState(false);
  const [answer, setAnswer] = useState<{ draft: ShapedDraft; requestId: string } | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [phase, setPhase] = useState(0);
  const [slow, setSlow] = useState(false);
  const composer = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const first = me.name.trim().split(/\s+/)[0] || me.name;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  // Components the words suggest, lit while you type and used for the first beads.
  const guessed = useMemo(() => guessComponents(prompt, types), [prompt, types]);
  const [beadsFromGuess, setBeadsFromGuess] = useState<Bead[]>([]);
  const beads: Bead[] = answer
    ? answer.draft.components.map((c) => {
        const t = typeById.get(c.typeId);
        return { key: c.typeId, color: t?.color ?? "gray", icon: t?.icon ?? null };
      })
    : beadsFromGuess;

  function send() {
    const text = prompt.trim();
    if (!text) return;
    const id = ++run.current;
    const motion = !reducedMotion();
    const guess = guessComponents(text, types);
    const start = (guess.length ? guess : types.slice(0, 3)).slice(0, 4);
    setBeadsFromGuess(start.map((t) => ({ key: t.id, color: t.color, icon: t.icon })));
    setAnswer(null);
    setRevealed(0);
    setResolved(0);
    setPhase(0);
    setSlow(false);
    setOrbiting(motion);
    setStep({
      kind: "shaping",
      from: motion ? (composer.current?.getBoundingClientRect() ?? null) : null,
    });
    startTransition(async () => {
      const r = await shape(text);
      if (run.current !== id) return; // started over meanwhile
      if (!r.ok) {
        setOrbiting(false);
        setStep({ kind: "describe", error: r.error, canRetry: r.kind === "failed" });
        return;
      }
      setAnswer({ draft: r.draft, requestId: r.requestId });
      if (!motion) {
        // Reduced motion: straight to the review, everything shown.
        setRevealed(Infinity);
        setResolved(Infinity);
        setStep({ kind: "review", draft: r.draft, requestId: r.requestId });
      }
    });
  }

  // Sent from Home: start once, on arrival.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStarted.current && initialPrompt.trim() && aiReady) {
      autoStarted.current = true;
      send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The status line under "Shaping your capsule".
  useEffect(() => {
    if (step.kind !== "shaping") return;
    const timers = [
      setTimeout(() => setPhase(1), 1200),
      setTimeout(() => setPhase(2), 2600),
      setTimeout(() => setSlow(true), 12000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [step.kind]);

  // Once every row is in, owners and dates resolve one row at a time.
  useEffect(() => {
    if (step.kind !== "review" || orbiting || resolved >= (answer?.draft.components.length ?? 0))
      return;
    const t = setTimeout(() => setResolved((r) => r + 1), resolved === 0 ? 200 : 320);
    return () => clearTimeout(t);
  }, [step.kind, orbiting, resolved, answer]);

  function startOver() {
    run.current++;
    setOrbiting(false);
    setAnswer(null);
    setStep({ kind: "describe" });
  }

  // Orbit stays mounted from the shaping screen into the review, so the
  // beads can morph into the review's rows.
  const orbit = orbiting && (
    <Orbit
      prompt={prompt}
      from={step.kind === "shaping" ? step.from : null}
      beads={beads}
      answered={answer !== null}
      onReview={() => answer && setStep({ kind: "review", ...answer })}
      onRowSettled={(i) => setRevealed((r) => Math.max(r, i + 1))}
      onDone={() => {
        setRevealed(Infinity);
        setOrbiting(false);
      }}
    />
  );

  return (
    <>
      {renderStep()}
      {orbit}
    </>
  );

  // A plain function (not a component), so the form keeps its state.
  function renderStep() {
    if (step.kind === "scratch" || step.kind === "review") {
      return (
        <NewCapsuleForm
          key={step.kind === "review" ? step.requestId : "scratch"}
          spaces={spaces}
          people={people}
          types={types}
          me={me}
          defaultSpaceId={defaultSpaceId}
          initial={step.kind === "review" ? step.draft : undefined}
          defaultOutcome={step.kind === "scratch" ? step.outcome : ""}
          review={
            step.kind === "review"
              ? {
                  requestId: step.requestId,
                  note: step.draft.note,
                  onStartOver: startOver,
                  revealed,
                  resolved,
                }
              : undefined
          }
        />
      );
    }

    if (step.kind === "shaping") {
      return (
        <div className="mx-auto flex max-w-[860px] flex-col items-center gap-3.5 px-4 pt-16 text-center laptop:px-8">
          <h1 className="animate-fade-in text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
            Shaping your capsule
          </h1>
          <p className="max-w-[600px] animate-lift-in text-[15px] leading-[22px] text-muted-foreground">
            “{prompt.length > 120 ? `${prompt.slice(0, 117)}…` : prompt}”
          </p>
          <p role="status" aria-live="polite" className="text-[13px] text-muted-foreground">
            {slow ? "Still shaping. This can take up to half a minute." : PHASES[phase]}
          </p>
          <div id="orbit-anchor" className="h-80 w-full" aria-hidden="true" />
        </div>
      );
    }

    // Describe
    const lit = new Set(guessed.map((t) => t.id));
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 pt-10 pb-24 laptop:px-8 laptop:pt-[72px]">
        <section
          aria-labelledby="desc-h"
          className="mx-auto flex w-full max-w-[720px] flex-col gap-6"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <h1
              id="desc-h"
              className="text-[32px] leading-[38px] font-semibold tracking-[-0.025em] laptop:text-[40px] laptop:leading-[46px]"
            >
              What are you working toward, {first}?
            </h1>
            <p className="max-w-[560px] text-[15px] leading-[22px] text-muted-foreground">
              Describe the outcome in a sentence or two. Capsule suggests the components, owners,
              dates and first work items.
            </p>
          </div>
          <Composer
            ref={composer}
            value={prompt}
            onChange={setPrompt}
            onSend={send}
            disabled={!aiReady}
            error={step.error}
            large
          />
          {!aiReady && (
            <p className="-mt-2 text-center text-[13px] text-muted-foreground">
              AI shaping isn’t set up yet, so fill in the fields yourself for now.
            </p>
          )}
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5" aria-hidden="true">
            {types.map((t) => {
              const on = lit.has(t.id);
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center gap-1.5 text-[13px] transition-colors duration-200 motion-reduce:transition-none",
                    on ? "font-medium text-foreground" : "text-faint",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-transform duration-200 motion-reduce:transition-none",
                      on ? cn(COMPONENT_COLOR_CLASSES[t.color].dot, "scale-125") : "bg-border",
                    )}
                  />
                  {t.name}
                </li>
              );
            })}
          </ul>
          <span role="status" className="sr-only">
            {guessed.length ? `Likely components: ${guessed.map((t) => t.name).join(", ")}` : ""}
          </span>
          <p className="text-center text-muted-foreground">
            Rather set it up yourself?{" "}
            <button
              type="button"
              onClick={() => setStep({ kind: "scratch", outcome: step.error ? prompt.trim() : "" })}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Fill in the fields
            </button>
          </p>
        </section>
      </div>
    );
  }
}

/** The "Describe the outcome" box with Try chips (prototype .composer). */
export function Composer({
  ref,
  value,
  onChange,
  onSend,
  disabled,
  error,
  large,
  label = "Describe the outcome",
  heading,
  tries = TRY,
}: {
  ref?: React.Ref<HTMLDivElement>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  error?: string;
  large?: boolean;
  label?: string;
  /** A visible label inside the box, like Home's "Start a capsule". */
  heading?: string;
  tries?: readonly (readonly [string, string])[];
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border border-border bg-surface shadow-composer focus-within:border-control",
        large ? "pt-[18px] pr-4 pb-3 pl-5" : "pt-3.5 pr-3 pb-3 pl-4",
      )}
    >
      {heading && (
        <label htmlFor="prompt" className="-mb-1.5 text-[13px] font-medium text-foreground">
          {heading}
        </label>
      )}
      <div className="flex items-end gap-3">
        {!heading && (
          <label htmlFor="prompt" className="sr-only">
            {label}
          </label>
        )}
        <textarea
          id="prompt"
          rows={large ? 3 : 2}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!disabled) onSend();
            }
          }}
          placeholder="Describe the outcome you’re working toward"
          className="min-h-12 flex-1 resize-none bg-transparent text-base leading-6 text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={disabled || !value.trim()}
          onClick={onSend}
          className="flex size-9 flex-none items-center justify-center rounded-full bg-primary text-foreground hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-foreground"
        >
          <ArrowUp size={16} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] text-c-red-fg">
          <Warning size={14} className="mt-0.5 flex-none" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-divider pt-3">
        <span className="mr-0.5 text-[13px] text-muted-foreground">Try</span>
        {tries.map(([chip, text]) => (
          <button
            key={chip}
            type="button"
            onClick={() => onChange(text)}
            className="inline-flex h-7 items-center rounded-full border border-border bg-bg px-3 text-[13px] hover:bg-subtle"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
