"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Composer, HOME_TRY } from "../new/new-capsule-flow";

/** "Start a capsule" on Home (decision 43): sending goes straight into Orbit. */
export function StartCapsule() {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <section aria-label="Start a capsule">
      <Composer
        heading="Start a capsule"
        tries={HOME_TRY}
        value={text}
        onChange={setText}
        onSend={() => router.push(`/new?go=1&prompt=${encodeURIComponent(text.trim())}`)}
      />
    </section>
  );
}
