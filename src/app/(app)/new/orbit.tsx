"use client";

import { useEffect, useRef } from "react";
import { ComponentIcon } from "@/components/component-icon";
import { COMPONENT_COLOR_CLASSES, type ComponentColor } from "@/lib/design";
import { cn } from "@/lib/utils";

/*
 * Orbit: the "shaping your capsule" motion (design-decisions.md section 14,
 * prototype orbitStart / orbitFrame, CLAUDE.md "Orbit").
 *
 * Timeline (ms from send): the composer shrinks (0–480) into the frosted
 * mini page (250–700); beads land at 1100 / 1650 / 2200 / 2750 and circle it.
 * Unlike the fixed-length motion study, the beads keep circling until
 * Claude's answer arrives (and always finish landing first, decision 13).
 * Then the review page renders and each bead morphs into its component row.
 *
 * Positions change every frame, so they're written straight to the elements
 * (not through React state). Reduced motion never mounts this component.
 */

export type Bead = { key: string; color: ComponentColor; icon: string | null };

const LAND = [1100, 1650, 2200, 2750];
const MIN_REVIEW = 3300;
const MAX_BEADS = 4;

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eo = (x: number) => 1 - Math.pow(1 - x, 3);
const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const spring = (x: number) => (x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.2) * Math.exp(-x * 5));

export function Orbit({
  prompt,
  from,
  beads,
  answered,
  onReview,
  onRowSettled,
  onDone,
}: {
  prompt: string;
  /** Where the composer was, so it can shrink from there (null when started from a link). */
  from: { left: number; top: number; width: number; height: number } | null;
  /** The guessed components at first, then the real ones once Claude answers. */
  beads: Bead[];
  /** Claude's answer has arrived. */
  answered: boolean;
  /** Time to show the review page (its rows start hidden). */
  onReview: () => void;
  /** Bead i has become row i. */
  onRowSettled: (i: number) => void;
  /** All beads have settled; remove the layer. */
  onDone: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const shown = beads.slice(0, MAX_BEADS);
  // Read inside the animation loop without restarting it.
  const live = useRef({ beads: shown.length, answered, onReview, onRowSettled, onDone });
  useEffect(() => {
    live.current = { beads: shown.length, answered, onReview, onRowSettled, onDone };
  });

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const q = <T extends Element>(s: string) => Array.from(el.querySelectorAll<T>(s));
    const t0 = performance.now();
    let frame = 0;
    let cx = window.innerWidth / 2;
    let cy = 360;
    let answeredAt: number | null = null;
    let reviewAt: number | null = null;
    let reviewShown = false;
    const settled = new Set<number>();
    // Beads added after the first ones landed come in quickly after the answer.
    const landAt: number[] = [];

    const put = (
      node: HTMLElement,
      x: number,
      y: number,
      o: number,
      s = 1,
      w?: number,
      h?: number,
      rad?: number,
    ) => {
      node.style.transform = `translate(${x}px, ${y}px)${s !== 1 ? ` scale(${s})` : ""}`;
      if (w != null) node.style.width = `${w}px`;
      if (h != null) node.style.height = `${h}px`;
      if (rad != null) node.style.borderRadius = `${rad}px`;
      node.style.opacity = String(o);
      node.style.visibility = o <= 0.001 ? "hidden" : "visible";
    };

    const tick = (now: number) => {
      const t = now - t0;
      const L = live.current;
      const prog = (a: number, b: number) => clamp((t - a) / (b - a));
      const n = L.beads;

      for (let i = 0; i < n; i++) {
        if (landAt[i] == null) {
          landAt[i] = answeredAt == null ? LAND[i] : Math.max(LAND[i], answeredAt + 150 * (i + 1));
        }
      }
      if (L.answered && answeredAt == null) answeredAt = t;
      if (answeredAt != null && reviewAt == null) {
        const lastLand = Math.max(...landAt.slice(0, n), 0);
        reviewAt = Math.max(MIN_REVIEW, lastLand + 550, answeredAt + 200);
      }
      if (reviewAt != null && t >= reviewAt && !reviewShown) {
        reviewShown = true;
        L.onReview();
      }

      // The orbit centre follows the empty space the shaping screen leaves.
      const anchor = document.getElementById("orbit-anchor");
      if (anchor) {
        const a = anchor.getBoundingClientRect();
        cx = a.left + a.width / 2;
        cy = a.top + a.height / 2;
      }
      const A = t / 1000;

      // Soft colored light behind the glass, fading once the review opens.
      const ambOut = reviewAt == null ? 0 : prog(reviewAt, reviewAt + 1000);
      q<HTMLElement>(".ob-amb").forEach((node, i) => {
        const p = [
          [-260, -120, 0.6, 0.5],
          [40, -60, 0.55, 0.7],
          [-120, 90, 0.45, 0.6],
        ][i];
        put(
          node,
          cx + p[0] + Math.sin(A * p[2]) * 50,
          cy + p[1] + Math.cos(A * p[3]) * 35,
          (1 - ambOut) * eo(prog(0, 600)),
        );
      });

      // The composer shrinks into the mini page.
      const composer = el.querySelector<HTMLElement>(".ob-composer");
      if (composer) {
        if (from) {
          const cs = eo(prog(0, 480));
          put(
            composer,
            lerp(from.left, cx - from.width / 2, cs),
            lerp(from.top, cy - from.height / 2, cs),
            1 - eo(prog(80, 460)),
            lerp(1, 0.3, cs),
            from.width,
            from.height,
          );
        } else {
          composer.style.visibility = "hidden";
        }
      }

      // The mini page: in, gently pulsing while it waits, out before the review.
      const orb = el.querySelector<HTMLElement>(".ob-orb");
      if (orb) {
        const orbIn = eo(prog(250, 700));
        const orbOut = reviewAt == null ? 0 : prog(reviewAt - 500, reviewAt + 200);
        const pulse = 1 + Math.sin(t / 260) * 0.035 * (1 - orbOut);
        orb.style.zIndex = "2";
        put(
          orb,
          cx - 88,
          cy - 54,
          orbIn * (1 - orbOut),
          lerp(0.4, 1, orbIn) * pulse * lerp(1, 0.6, orbOut),
        );
      }

      // Beads circle on a tilted ellipse, slowing as the review opens.
      const slowFrom = reviewAt == null ? t : reviewAt - 500;
      let rot = (1.1 * Math.min(t, slowFrom)) / 1000;
      if (t > slowFrom) {
        const d = Math.min((t - slowFrom) / 1000, 1.2);
        rot += 1.1 * (d - (d * d) / 2.4);
      }

      let done = reviewShown;
      q<HTMLElement>(".ob-bead").forEach((node, i) => {
        if (i >= n) return;
        const pa = prog(landAt[i] - 320, landAt[i] + 380);
        const row = reviewShown
          ? document.querySelector<HTMLElement>(`[data-shape-index="${i}"]`)
          : null;
        const rr = row?.getBoundingClientRect() ?? null;
        const ms = (reviewAt ?? Infinity) + 50 + i * 90;
        const m = rr ? eio(prog(ms, ms + 1080)) : 0;
        const th = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(n, 4) + rot;
        const R = lerp(30, Math.min(200, window.innerWidth / 4), spring(pa));
        const ox = cx + Math.cos(th) * R;
        const oy = cy + Math.sin(th) * R * 0.42;
        const depth = Math.sin(th);
        const bs = 52 * lerp(0.55, 1, eo(pa)) * (1 + depth * 0.08 * (1 - m));
        const x = lerp(ox - bs / 2, rr ? rr.left : 0, m);
        const y = lerp(oy - bs / 2, rr ? rr.top : 0, m);
        const w = lerp(bs, rr ? rr.width : bs, m);
        const h = lerp(bs, rr ? rr.height : bs, m);
        if (m >= 1 && !settled.has(i)) {
          settled.add(i);
          L.onRowSettled(i);
        }
        const fadeOut = m >= 1 ? clamp((t - (ms + 1080)) / 260) : 0;
        if (fadeOut < 1) done = false;
        put(
          node,
          x,
          y,
          eo(pa) * (1 - 0.25 * Math.max(0, -depth) * (1 - m)) * (1 - fadeOut),
          1,
          w,
          h,
          lerp(bs / 2, 16, m),
        );
        // Beads on the back half pass behind the mini page.
        node.style.zIndex = depth > 0 || m > 0 ? "3" : "1";
        const ic = node.querySelector<HTMLElement>(".ob-ic");
        const tint = node.querySelector<HTMLElement>(".ob-tint");
        const face = node.querySelector<HTMLElement>(".ob-face");
        if (ic) ic.style.opacity = String(1 - clamp((m - 0.25) / 0.35));
        if (tint) tint.style.opacity = String(lerp(0.95, 0.45, clamp(m / 0.8)));
        if (face) face.style.opacity = String(clamp((m - 0.2) / 0.4));
      });

      if (done && reviewAt != null && t > reviewAt + 600) {
        L.onDone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The loop reads changing values through `live`; it starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={layer} className="orbit-layer" aria-hidden="true">
      <span className="ob-amb bg-c-blue" />
      <span className="ob-amb bg-c-orange" />
      <span className="ob-amb bg-c-green" />
      <div className="ob-glass ob-composer text-foreground">
        <span>{prompt}</span>
      </div>
      <div className="ob-glass ob-orb">
        <span className="ob-l ob-h" />
        <span className="ob-l" style={{ width: "78%" }} />
        <span className="ob-l" style={{ width: "92%" }} />
        <span className="ob-l" style={{ width: "46%" }} />
      </div>
      {shown.map((b, i) => (
        <div key={i} className="ob-bead">
          <span className={cn("ob-tint", COMPONENT_COLOR_CLASSES[b.color].tag)} />
          <span className="ob-face" />
          <span className={cn("ob-ic", COMPONENT_COLOR_CLASSES[b.color].text)}>
            <ComponentIcon icon={b.icon} size={22} />
          </span>
        </div>
      ))}
    </div>
  );
}
