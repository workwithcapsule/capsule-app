"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
 * The person's answer on the AI app approval page (step 13). Supabase Auth
 * records it and gives back the address to send them to: the app's own
 * page, with a sign-in code if they allowed it.
 */

async function decide(form: FormData, allow: boolean) {
  const id = String(form.get("authorization_id") ?? "");
  if (!id) redirect("/oauth/consent?error=missing");
  const supabase = await createClient();
  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect("/oauth/consent?error=expired");
  redirect(data.redirect_url);
}

export async function allowApp(form: FormData) {
  await decide(form, true);
}

export async function denyApp(form: FormData) {
  await decide(form, false);
}
