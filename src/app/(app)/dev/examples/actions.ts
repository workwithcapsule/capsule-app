"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { examplesAllowed, removeExamples, seedExamples } from "@/lib/examples/seed";

type Result = { ok: true; message: string } | { ok: false; error: string };

/** The signed-in person, if they may use example data; checked on every call. */
export async function exampleUser() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub as string | undefined;
  if (!id) return null;
  const [{ data: me }, { data: membership }] = await Promise.all([
    supabase.from("users").select("email").eq("id", id).single(),
    supabase.from("org_members").select("org_id").eq("user_id", id).limit(1).maybeSingle(),
  ]);
  if (!me || !membership || !examplesAllowed(me.email)) return null;
  return { id, email: me.email as string, orgId: membership.org_id as string };
}

async function run(fn: typeof seedExamples | typeof removeExamples, done: string): Promise<Result> {
  const me = await exampleUser();
  if (!me) return { ok: false, error: "Example data isn’t turned on for your account." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "The server’s Supabase secret key isn’t set." };
  try {
    await fn(admin, me);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: done };
}

export async function refreshExamples(): Promise<Result> {
  return run(seedExamples, "Examples are ready.");
}

export async function deleteExamples(): Promise<Result> {
  return run(removeExamples, "Examples removed.");
}
