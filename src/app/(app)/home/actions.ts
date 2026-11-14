"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
type Row = { orgId: string; capsuleId: string; kind: string; targetId: string; since: string };

/** Removes a row from your Needs your attention until it changes (build-decisions.md 37). */
export async function dismissAttention(row: Row): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { ok: false, error: "Sign in again to do that." };
  const { error } = await supabase.from("dismissals").upsert(
    {
      org_id: row.orgId,
      user_id: userId,
      capsule_id: row.capsuleId,
      kind: row.kind,
      target_id: row.targetId,
      since: row.since,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind,target_id" },
  );
  if (error) return { ok: false, error: "Couldn’t remove that. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function undoDismissAttention(row: Pick<Row, "kind" | "targetId">): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { ok: false, error: "Sign in again to do that." };
  const { error } = await supabase
    .from("dismissals")
    .delete()
    .eq("user_id", userId)
    .eq("kind", row.kind)
    .eq("target_id", row.targetId);
  if (error) return { ok: false, error: "Couldn’t put that back. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
