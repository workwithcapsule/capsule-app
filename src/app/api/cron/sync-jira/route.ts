import { NextResponse } from "next/server";
import { syncLinkedItems } from "@/lib/jira/client";

/*
 * Nightly refresh of linked Jira items (step 14, build-decisions.md 68).
 * Capsules also refresh their linked items when someone opens them; this
 * catches the ones nobody opened. Vercel Cron calls it with CRON_SECRET.
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const result = await syncLinkedItems({ olderThanMs: 6 * 3_600_000, limit: 2000 });
  return NextResponse.json(result);
}
