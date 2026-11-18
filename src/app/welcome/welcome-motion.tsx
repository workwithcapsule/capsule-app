"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ComponentIcon } from "@/components/component-icon";
import { CapsuleMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { COMPONENT_COLOR_CLASSES, type ComponentColor } from "@/lib/design";
import { cn } from "@/lib/utils";

export type WelcomeBead = { id: string; name: string; color: ComponentColor; icon: string | null };

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"; // Orbit's easing (--ease-capsule)

/**
 * The welcome animation (docs/sketches/welcome-motion.html), in Orbit's motion
 * family: a glow in the org's component colors behind a frosted glass card,
 * then one bead per component, each with its own icon and color, drifts in
 * and settles into a row; the greeting lifts in. "Go to your homepage" sends
 * the beads toward the sidebar before Home. Reduced motion: one short fade.
 */
export function WelcomeMotion({
  title,
  line,
  beads,
}: {
  title: string;
  line: string;
  beads: WelcomeBead[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const leaving = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = (s: string) => [...el.querySelectorAll<HTMLElement>(s)];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anims: Animation[] = [];
    const run = (n: HTMLElement, k: Keyframe[], o: KeyframeAnimationOptions) =>
      anims.push(n.animate(k, { fill: "both", ...o }));

    if (reduce) {
      q("[data-w]").forEach((n) =>
        run(n, [{ opacity: 0 }, { opacity: n.dataset.w === "amb" ? 0.5 : 1 }], { duration: 250 }),
      );
      return () => anims.forEach((a) => a.cancel());
    }

    const dark = document.documentElement.classList.contains("dark");
    q('[data-w="amb"]').forEach((n, i) =>
      run(
        n,
        [
          { opacity: 0, transform: "scale(0.8)" },
          { opacity: dark ? 0.3 : 0.55, transform: "scale(1)" },
        ],
        { duration: 900, delay: i * 80, easing: EASE },
      ),
    );
    q('[data-w="card"]').forEach((n) =>
      run(
        n,
        [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 500, delay: 100, easing: EASE },
      ),
    );
    q('[data-w="mark"]').forEach((n) =>
      run(
        n,
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 400, delay: 300, easing: EASE },
      ),
    );
    const bs = q('[data-w="bead"]');
    bs.forEach((n, i) => {
      const angle = (i / bs.length) * Math.PI * 2 + 0.6;
      const dx = Math.cos(angle) * 260;
      const dy = Math.sin(angle) * 180;
      run(
        n,
        [
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.6)` },
          { opacity: 1, offset: 0.4 },
          {
            opacity: 1,
            transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 8}px) scale(1.04)`,
            offset: 0.8,
          },
          { opacity: 1, transform: "none" },
        ],
        { duration: 900, delay: 450 + i * 90, easing: EASE },
      );
    });
    const after = 450 + bs.length * 90 + 600;
    q('[data-w="title"]').forEach((n) =>
      run(
        n,
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 500, delay: after, easing: EASE },
      ),
    );
    q('[data-w="fade"]').forEach((n, i) =>
      run(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: after + 200 + i * 100 }),
    );
    return () => anims.forEach((a) => a.cancel());
  }, []);

  function go(e: React.MouseEvent) {
    const el = root.current;
    if (!el || leaving.current) return;
    e.preventDefault();
    leaving.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = (s: string) => [...el.querySelectorAll<HTMLElement>(s)];
    if (reduce) {
      q('[data-w="card"]').forEach((n) =>
        n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }),
      );
      setTimeout(() => router.push("/"), 200);
      return;
    }
    // The beads gather toward the sidebar, where the person's work will be.
    q('[data-w="bead"]').forEach((n, i) =>
      n.animate(
        [{ transform: "none" }, { transform: "translate(-40vw, -40vh) scale(0.4)", opacity: 0 }],
        {
          duration: 600,
          delay: i * 50,
          easing: EASE,
          fill: "forwards",
        },
      ),
    );
    q('[data-w="amb"]').forEach((n) =>
      n.animate([{}, { opacity: 0 }], { duration: 500, fill: "forwards" }),
    );
    q('[data-w="card"]').forEach((n) =>
      n.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.98)" }], {
        duration: 400,
        delay: 250,
        easing: EASE,
        fill: "forwards",
      }),
    );
    router.prefetch("/");
    setTimeout(() => router.push("/"), 650);
  }

  const glow = beads.slice(0, 3);
  return (
    <main
      ref={root}
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10"
    >
      {glow.map((b, i) => (
        <span
          key={b.id}
          data-w="amb"
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute size-[300px] rounded-full opacity-0 blur-[60px]",
            COMPONENT_COLOR_CLASSES[b.color].tag,
          )}
          style={{
            left: `calc(50% + ${(i - 1) * 180 - 150}px)`,
            top: `calc(50% + ${i % 2 ? 60 : -140}px)`,
          }}
        />
      ))}
      <div
        data-w="card"
        className="ob-glass relative flex w-full max-w-[520px] flex-col items-center gap-3.5 rounded-3xl px-6 pt-10 pb-8 text-center opacity-0 laptop:px-8"
      >
        <span data-w="mark" className="opacity-0">
          <CapsuleMark width={44} />
        </span>
        {beads.length > 0 && (
          <ul
            aria-label="Your org’s components"
            className="m-0 flex list-none flex-wrap items-center justify-center gap-2.5 p-0"
          >
            {beads.map((b) => (
              <li
                key={b.id}
                data-w="bead"
                title={b.name}
                className="ob-bead relative size-[52px] flex-none opacity-0"
              >
                <span className={cn("ob-tint", COMPONENT_COLOR_CLASSES[b.color].tag)} />
                <span className="ob-face" />
                <span className={cn("ob-ic", COMPONENT_COLOR_CLASSES[b.color].text)}>
                  <ComponentIcon icon={b.icon} size={22} aria-hidden="true" />
                </span>
                <span className="sr-only">{b.name}</span>
              </li>
            ))}
          </ul>
        )}
        <h1
          data-w="title"
          className="mt-1.5 text-[32px] leading-[38px] font-semibold tracking-[-0.02em] opacity-0"
        >
          {title}
        </h1>
        <p data-w="fade" className="m-0 text-[15px] text-muted-foreground opacity-0">
          {line}
        </p>
        <Button asChild variant="primary" size="lg" className="mt-1.5 opacity-0" data-w="fade">
          <Link href="/" onClick={go}>
            Go to your homepage
          </Link>
        </Button>
      </div>
    </main>
  );
}
