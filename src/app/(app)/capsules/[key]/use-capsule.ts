"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/toaster";
import type { CapsuleComponent, CapsuleData, WorkItem } from "@/lib/capsule-types";
import type { Result } from "../actions";

/*
 * The capsule page's state. Every change shows at once (an "optimistic"
 * update) while the server saves it; the server's fresh data then replaces
 * it. If the server says no, the change disappears and a toast explains why.
 */

export type Op =
  | { type: "capsule"; patch: Partial<CapsuleData["capsule"]> }
  | { type: "component"; id: string; patch: Partial<CapsuleComponent> }
  | { type: "item"; id: string; patch: Partial<WorkItem> }
  | { type: "addItem"; item: WorkItem }
  | { type: "removeItem"; id: string }
  | { type: "addCollaborator"; componentId: string; userId: string }
  | { type: "removeCollaborator"; componentId: string; userId: string };

function apply(state: CapsuleData, op: Op): CapsuleData {
  switch (op.type) {
    case "capsule":
      return { ...state, capsule: { ...state.capsule, ...op.patch } };
    case "component":
      return {
        ...state,
        components: state.components.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c)),
      };
    case "item":
      return {
        ...state,
        items: state.items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i)),
      };
    case "addItem":
      return { ...state, items: [...state.items, op.item] };
    case "removeItem":
      return { ...state, items: state.items.filter((i) => i.id !== op.id) };
    case "addCollaborator":
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === op.componentId
            ? {
                ...c,
                collaborators: [
                  ...c.collaborators,
                  { userId: op.userId, source: "added" as const },
                ],
              }
            : c,
        ),
      };
    case "removeCollaborator":
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === op.componentId
            ? { ...c, collaborators: c.collaborators.filter((p) => p.userId !== op.userId) }
            : c,
        ),
      };
  }
}

export function useCapsule(initial: CapsuleData) {
  const [view, addOptimistic] = useOptimistic(initial, apply);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  /**
   * Shows `op` right away and runs `save`. On success, optionally shows a
   * toast; if `undo` is given, the toast offers Undo (which runs undo's own op
   * and save, without a further Undo).
   */
  function change(
    op: Op | Op[],
    save: () => Promise<Result<unknown>>,
    options: {
      message?: string;
      undo?: { op: Op | Op[]; save: () => Promise<Result<unknown>> };
    } = {},
  ) {
    startTransition(async () => {
      for (const o of Array.isArray(op) ? op : [op]) addOptimistic(o);
      const r = await save();
      if (!r.ok) {
        toast(r.error);
        return;
      }
      if (options.message) {
        const undo = options.undo;
        toast(options.message, undo ? { undo: () => change(undo.op, undo.save) } : undefined);
      }
    });
  }

  return { view, change, pending };
}
