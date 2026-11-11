import type { Metadata } from "next";
import { Suspense } from "react";
import { loadOnboarding } from "./data";
import { OnboardingFlow } from "./flow";

export const metadata: Metadata = { title: "Set up Capsule" };

async function Onboarding() {
  const initial = await loadOnboarding();
  return <OnboardingFlow initial={initial} />;
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
