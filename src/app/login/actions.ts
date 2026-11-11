"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/routing";
import { siteOrigin } from "@/lib/site";
import { isEmail } from "@/lib/validation";

export type SignInState =
  { status: "idle"; email?: string; error?: string } | { status: "sent"; email: string };

export async function sendSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const next = safeNext(String(form.get("next") ?? "/"));

  if (!email) return { status: "idle", email, error: "Enter your work email." };
  if (!isEmail(email)) {
    return {
      status: "idle",
      email,
      error: "That doesn’t look like an email address. Check for typos.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const tooMany = error.status === 429 || /rate limit/i.test(error.message);
    return {
      status: "idle",
      email,
      error: tooMany
        ? "Too many sign-in emails in a short time. Wait a minute, then try again."
        : "We couldn’t send the email. Check the address and try again.",
    };
  }
  return { status: "sent", email };
}
