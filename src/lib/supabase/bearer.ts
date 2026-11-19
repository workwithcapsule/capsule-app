import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The person an AI app is acting for, during one MCP request (step 13).
 *
 * The MCP route checks the app's token, then runs the request inside
 * `actingAs.run(...)`. While it runs, `createClient()` in ./server signs in
 * with that token instead of cookies, so every loader and action works
 * exactly as in the app, under the same database rules.
 */
export type Acting = {
  token: string;
  userId: string;
  claims: Record<string, unknown>;
  /** The app's name as the person approved it, e.g. "Claude". */
  app: string;
};

export const actingAs = new AsyncLocalStorage<Acting>();

/** The AI app making the current request, or null in the app itself. */
export function currentApp(): string | null {
  return actingAs.getStore()?.app ?? null;
}
