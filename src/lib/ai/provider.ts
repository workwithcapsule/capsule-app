import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Anthropic as PostHogAnthropic } from "@posthog/ai/anthropic";
import { PostHog } from "posthog-node";
import type { ShapingContext } from "./context";
import { guessComponents } from "./guess";
import { ShapeOutput } from "./schema";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const posthog =
  posthogKey && posthogHost
    ? new PostHog(posthogKey, {
        host: posthogHost,
        privacyMode: false,
        flushAt: 1,
        flushInterval: 0,
        requestTimeout: 2000,
        fetchRetryCount: 0,
      })
    : null;

if (!posthog && process.env.NODE_ENV !== "production") {
  if (!posthogKey) {
    console.warn(
      "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured",
    );
  }
  if (!posthogHost) {
    console.warn(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
    );
  }
}

/*
 * The AI call behind one small interface, so another provider can be added
 * later without touching the rest of the app (your AI shaping prompt, item 5).
 */

export type ProviderAnswer = {
  /** The raw answer, checked by the caller against ShapeOutput. */
  output: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface ShapingProvider {
  readonly name: string;
  shape(input: {
    system: string;
    message: string;
    ctx: ShapingContext;
    description: string;
    signal: AbortSignal;
    sessionId: string;
    traceId: string;
    userId: string;
  }): Promise<ProviderAnswer>;
  flush(): Promise<void>;
}

/** Thrown for answers that can't be used, with a message safe to log. */
export class ShapingError extends Error {}

/** Claude, through the official SDK. The model and effort come from settings. */
class AnthropicProvider implements ShapingProvider {
  readonly name = "anthropic";
  private client = posthog ? null : new Anthropic({ maxRetries: 1 });
  private observedClient = posthog
    ? new PostHogAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        maxRetries: 1,
        posthog,
      })
    : null;
  private model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  private effort = (process.env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high";

  async shape({
    system,
    message,
    signal,
    sessionId,
    traceId,
    userId,
  }: Parameters<ShapingProvider["shape"]>[0]) {
    const request = {
      model: this.model,
      max_tokens: 8000,
      // If a safety filter declines, Anthropic retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
      output_config: { effort: this.effort, format: zodOutputFormat(ShapeOutput) },
      system,
      messages: [{ role: "user" as const, content: message }],
    };
    const observedRequest = {
      ...request,
      posthogDistinctId: userId,
      posthogTraceId: traceId,
      posthogProperties: { $ai_session_id: sessionId },
    };
    const res = this.observedClient
      ? await this.observedClient.beta.messages.create(observedRequest, { signal })
      : await this.client!.beta.messages.create(request, { signal });
    if (res.stop_reason === "refusal") throw new ShapingError("Claude declined this description");
    if (res.stop_reason === "max_tokens") throw new ShapingError("The answer was cut off");
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new ShapingError("The answer wasn't valid JSON");
    }
    return {
      output,
      model: res.model,
      inputTokens: res.usage.input_tokens ?? null,
      outputTokens: res.usage.output_tokens ?? null,
    };
  }

  async flush() {
    if (posthog) await posthog.flush().catch(() => {});
  }
}

/**
 * A stand-in for local development and automated tests, so they never call
 * Claude or cost money. It picks components from the words in the
 * description. Include "[fail]" in a description to test the error path.
 */
class FakeProvider implements ShapingProvider {
  readonly name = "fake";

  async shape({ ctx, description, signal }: Parameters<ShapingProvider["shape"]>[0]) {
    const delay = Number(process.env.SHAPING_FAKE_DELAY_MS ?? 2500);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new ShapingError("Timed out"));
      });
    });
    if (description.includes("[fail]")) throw new ShapingError("Fake failure for testing");
    const picked = guessComponents(description, ctx.components);
    const chosen = (picked.length ? picked : ctx.components.slice(0, 3)).slice(0, 4);
    const launch = new Date(`${ctx.today}T00:00:00Z`);
    launch.setUTCDate(launch.getUTCDate() + 30);
    const launchDate = launch.toISOString().slice(0, 10);
    const ownerFor = (name: string) => {
      const usual = ctx.people.filter((p) => p.usual.includes(name));
      return usual.length === 1 ? usual[0].ref : null;
    };
    const output: ShapeOutput = {
      name: description
        .split(/\s+/)
        .slice(0, 5)
        .join(" ")
        .replace(/[.,!?]+$/, ""),
      outcome: description,
      space: ctx.spaces.find((s) => s.joined)?.ref ?? ctx.spaces[0]?.ref ?? null,
      launch_date: launchDate,
      date_type: "launch",
      owner: ctx.people[0]?.ref ?? null,
      components: chosen.map((c) => ({
        component: c.ref,
        goal: `${c.name} is ready for the launch.`,
        owner: ownerFor(c.name),
        due_date: launchDate,
        work_items: [{ title: `Plan the ${c.name} work`, assignee: ownerFor(c.name) }],
      })),
      note: null,
    };
    return { output, model: "fake", inputTokens: null, outputTokens: null };
  }

  async flush() {}
}

/** The provider to use: the fake when AI_PROVIDER=fake, Claude when a key is set, else none. */
export function getProvider(): ShapingProvider | null {
  // The fake is for local development and tests only, never production.
  if (process.env.AI_PROVIDER === "fake" && process.env.VERCEL_ENV !== "production") {
    return new FakeProvider();
  }
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
  return null;
}
