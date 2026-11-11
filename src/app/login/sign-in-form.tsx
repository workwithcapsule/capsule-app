"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { sendSignInLink, type SignInState } from "./actions";

const LINK_ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Enter your email for a new one.",
};

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const linkError = LINK_ERRORS[params.get("error") ?? ""];
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {
    status: "idle",
  });
  const [retry, setRetry] = useState(false);

  if (state.status === "sent" && !retry) {
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Check your email
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          We sent a sign-in link to <b className="font-semibold text-foreground">{state.email}</b>.
          It works once and expires in an hour.
        </p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Didn’t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setRetry(true)}
            className="font-medium text-foreground underline underline-offset-[3px]"
          >
            try a different email
          </button>
          .
        </p>
      </div>
    );
  }

  const error = state.status === "idle" && !retry ? state.error : undefined;
  const email = state.email;

  return (
    <form
      action={(fd) => {
        setRetry(false);
        return action(fd);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Sign in to Capsule
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Enter your work email and we’ll send you a link to sign in. No password needed.
        </p>
      </div>
      {linkError && (
        <p role="alert" className="rounded-[10px] bg-c-amber px-3 py-2 text-[13px] text-c-amber-fg">
          {linkError}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          defaultValue={email}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
        />
        <FieldError id="email-error">{error}</FieldError>
      </div>
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
