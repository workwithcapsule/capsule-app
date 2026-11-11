import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <span className="text-lg leading-6 font-semibold tracking-[-0.02em]">Capsule</span>
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
