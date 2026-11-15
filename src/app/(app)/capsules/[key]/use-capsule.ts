"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/toaster";
import type { ActivityEvent } from "@/lib/activity";
import type {
  Attachment,
  CapsuleComponent,
  CapsuleData,
  Piece,
  WorkItem,
} from "@/lib/capsule-types";
import { followPieces } from "@/lib/work-items";
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
  | { type: "addPiece"; piece: Piece }
  | { type: "piece"; id: string; patch: Partial<Piece> }
  | { type: "removePiece"; id: string }
  | { type: "addCollaborator"; componentId: string; userId: string }
  | { type: "removeCollaborator"; componentId: string; userId: string }
  | { type: "addEvent"; event: ActivityEvent }
  | { type: "follow"; userId: string; since: string }
  | { type: "unfollow"; userId: string }
  | { type: "addAttachment"; attachment: Attachment }
  | { type: "removeAttachment"; id: string };

/** After pieces change, the item follows them (unless set by hand), as in the database. */
function withPieces(state: CapsuleData, pieces: Piece[], itemId: string): CapsuleData {
  return {
    ...state,
    pieces,
    items: state.items.map((i) =>
      i.id === itemId
        ? followPieces(
            i,
            pieces.filter((p) => p.itemId === itemId),
          )
        : i,
    ),
  };
}

function apply(state: CapsuleData, op: Op): CapsuleData {
  switch (op.type) {
    case "addPiece":
      return withPieces(
        state,
        [
          ...state.pieces.map((p) =>
            op.piece.isLead && p.itemId === op.piece.itemId ? { ...p, isLead: false } : p,
          ),
          op.piece,
        ],
        op.piece.itemId,
      );
    case "piece": {
      const target = state.pieces.find((p) => p.id === op.id);
      if (!target) return state;
      return withPieces(
        state,
        state.pieces.map((p) =>
          p.id === op.id
            ? { ...p, ...op.patch }
            : op.patch.isLead && p.itemId === target.itemId
              ? { ...p, isLead: false }
              : p,
        ),
        target.itemId,
      );
    }
    case "removePiece": {
      const target = state.pieces.find((p) => p.id === op.id);
      if (!target) return state;
      return withPieces(
        state,
        state.pieces.filter((p) => p.id !== op.id),
        target.itemId,
      );
    }
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
      return {
        ...state,
        items: state.items.filter((i) => i.id !== op.id),
        pieces: state.pieces.filter((p) => p.itemId !== op.id),
      };
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
    case "addAttachment":
      return { ...state, attachments: [...state.attachments, op.attachment] };
    case "removeAttachment":
      return { ...state, attachments: state.attachments.filter((a) => a.id !== op.id) };
    case "follow":
      return {
        ...state,
        followers: [
          { userId: op.userId, since: op.since },
          ...state.followers.filter((f) => f.userId !== op.userId),
        ],
      };
    case "unfollow":
      return { ...state, followers: state.followers.filter((f) => f.userId !== op.userId) };
    case "addEvent":
      return { ...state, activity: [op.event, ...state.activity] };
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
   * and save, without a further Undo). `undo` may also be a function of what
   * the save returned (for example, a snapshot to restore).
   */
  type Undo = { op: Op | Op[]; save: () => Promise<Result<unknown>> };
  function change<T>(
    op: Op | Op[],
    save: () => Promise<Result<T>>,
    options: {
      message?: string;
      undo?: Undo | ((data: T | undefined) => Undo);
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
        const undo = typeof options.undo === "function" ? options.undo(r.data) : options.undo;
        toast(options.message, undo ? { undo: () => change(undo.op, undo.save) } : undefined);
      }
    });
  }

  return { view, change, pending };
}
