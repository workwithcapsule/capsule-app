import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildContext, contextMessage, type RawContext } from "./context";
import { SHAPING_SYSTEM_PROMPT } from "./prompt";
import { getProvider, ShapingError } from "./provider";
import { ShapeOutput } from "./schema";
import type { ShapeResult } from "./types";
import { toDraft } from "./validate";

const TIMEOUT_MS = 45_000;
export const MAX_DESCRIPTION = 2000;

const FAILED =
  "Capsule couldn’t shape this one. Fill in the fields yourself, or try again with a little more detail.";

/** Today in UTC as YYYY-MM-DD (dates are suggestions the person reviews). */
const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Loads what Claude needs to know about the org, as the signed-in person. */
async function loadRawContext(userId: string): Promise<RawContext | null> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const org = membership.org_id as string;
  const [types, spaces, joined, members, recent] = await Promise.all([
    supabase
      .from("component_types")
      .select("id, name, description")
      .eq("org_id", org)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("spaces")
      .select("id, name, key_prefix, description")
      .eq("org_id", org)
      .order("name"),
    supabase.from("space_members").select("space_id").eq("user_id", userId),
    supabase
      .from("org_members")
      .select("user_id, usual_component_type_ids, users(name, email)")
      .eq("org_id", org),
    supabase
      .from("capsules")
      .select("name, spaces(name), components(component_types(name))")
      .eq("org_id", org)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const joinedIds = new Set((joined.data ?? []).map((j) => j.space_id));
  return {
    today: todayUtc(),
    me: userId,
    types: (types.data ?? []).map((t) => ({ id: t.id, name: t.name, description: t.description })),
    spaces: (spaces.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      keyPrefix: s.key_prefix,
      description: s.description,
      joined: joinedIds.has(s.id),
    })),
    people: (members.data ?? []).map((m) => {
      const u = m.users as unknown as { name: string | null; email: string } | null;
      return {
        id: m.user_id,
        name: u?.name?.trim() || u?.email || "Someone",
        usualTypeIds: (m.usual_component_type_ids as string[] | null) ?? [],
      };
    }),
    recent: (recent.data ?? []).map((c) => ({
      name: c.name,
      space: (c.spaces as unknown as { name: string } | null)?.name ?? "",
      components: (
        (c.components as unknown as { component_types: { name: string } | null }[]) ?? []
      )
        .map((k) => k.component_types?.name)
        .filter((n): n is string => Boolean(n)),
    })),
  };
}

/**
 * Shapes a capsule from a description (step 9): checks the daily cap, asks
 * the provider, checks the answer (one retry if it doesn't fit), and records
 * the request. Runs as the signed-in person.
 */
export async function shapeCapsule(description: string): Promise<ShapeResult> {
  const text = description.trim().slice(0, MAX_DESCRIPTION);
  if (!text) return { ok: false, kind: "empty", error: "Describe the outcome first." };
  const provider = getProvider();
  if (!provider) {
    return {
      ok: false,
      kind: "not_configured",
      error: "AI shaping isn’t set up yet. Fill in the fields yourself for now.",
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return { ok: false, kind: "failed", error: "Sign in again to shape a capsule." };

  const { data: requestId, error: startError } = await supabase.rpc("start_shaping");
  if (startError) {
    // Shows in Vercel's runtime logs (a missing database update showed up only
    // as the general message once).
    console.error("[shaping] couldn't start a request:", startError.code, startError.message);
    if (startError.hint === "shaping_limit" || startError.message.includes("Daily shaping limit")) {
      return {
        ok: false,
        kind: "limit",
        error: "You’ve reached today’s shaping limit. Fill in the fields, or try again tomorrow.",
      };
    }
    return { ok: false, kind: "failed", error: FAILED };
  }

  const started = Date.now();
  const finish = (patch: Record<string, unknown>) =>
    supabase
      .from("shaping_requests")
      .update({ latency_ms: Date.now() - started, ...patch })
      .eq("id", requestId);

  try {
    const raw = await loadRawContext(userId);
    if (!raw || raw.types.length === 0) {
      await finish({ status: "failed", error: "No components in the org" });
      return {
        ok: false,
        kind: "failed",
        error: "Your organization has no components yet, so there’s nothing to shape with.",
      };
    }
    const ctx = buildContext(raw);
    const message = contextMessage(ctx, text);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    // Each persisted shaping request is this one-turn conversation. Retries share its trace.
    const sessionId = `shaping-${requestId as string}`;
    const traceId = crypto.randomUUID();

    let lastError = "";
    let tokens = { input: 0, output: 0, model: "" };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = await provider.shape({
          system: SHAPING_SYSTEM_PROMPT,
          message,
          ctx,
          description: text,
          signal,
          sessionId,
          traceId,
          userId,
        });
        tokens = {
          input: tokens.input + (answer.inputTokens ?? 0),
          output: tokens.output + (answer.outputTokens ?? 0),
          model: answer.model,
        };
        const parsed = ShapeOutput.safeParse(answer.output);
        if (!parsed.success) {
          lastError = "The answer didn't match the format";
          continue;
        }
        const draft = toDraft(parsed.data, ctx, text);
        if (draft.components.length === 0) {
          lastError = "No usable components in the answer";
          continue;
        }
        await finish({
          status: "ok",
          model: tokens.model,
          input_tokens: tokens.input || null,
          output_tokens: tokens.output || null,
        });
        return { ok: true, draft, requestId: requestId as string };
      } catch (e) {
        lastError = e instanceof ShapingError ? e.message : (e as Error).name || "Error";
        console.error("[shaping] attempt failed:", lastError, e instanceof ShapingError ? "" : e);
        // A timeout or a declined description won't get better on a retry.
        if (signal.aborted || !(e instanceof ShapingError) || /declined|Timed out/.test(lastError))
          break;
      }
    }
    await finish({
      status: "failed",
      error: lastError.slice(0, 500),
      model: tokens.model || null,
      input_tokens: tokens.input || null,
      output_tokens: tokens.output || null,
    });
    return { ok: false, kind: "failed", error: FAILED };
  } catch (e) {
    console.error("[shaping] unexpected error:", e);
    await finish({ status: "failed", error: "Unexpected error" });
    return { ok: false, kind: "failed", error: FAILED };
  } finally {
    await provider.flush();
  }
}
