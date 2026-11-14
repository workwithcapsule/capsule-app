"use server";

import { shapeCapsule } from "@/lib/ai/shape";
import type { ShapeResult } from "@/lib/ai/types";
import { createClient } from "@/lib/supabase/server";

/** Asks Claude to shape a capsule from a description (step 9). */
export async function shape(description: string): Promise<ShapeResult> {
  return shapeCapsule(description);
}

/** Records what happened to a suggestion: created as is, edited then created, or discarded. */
export async function recordShapingOutcome(
  requestId: string,
  outcome: "created" | "edited" | "discarded",
  capsuleId?: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("shaping_requests")
    .update({ outcome, capsule_id: capsuleId ?? null })
    .eq("id", requestId);
}
