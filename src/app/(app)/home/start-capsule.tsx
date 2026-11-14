"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "../new/new-capsule-flow";

/** "Start a capsule" on Home (decision 43): sending goes straight into Orbit. */
export function StartCapsule() {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <section aria-labelledby="start-h" className="flex flex-col gap-2">
      <h2 id="start-h" className="text-[13px] font-medium text-muted-foreground">
        Start a capsule
      </h2>
      <Composer
        value={text}
        onChange={setText}
        onSend={() => router.push(`/new?go=1&prompt=${encodeURIComponent(text.trim())}`)}
      />
    </section>
  );
}
