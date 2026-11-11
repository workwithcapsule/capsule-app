import { createHash, randomBytes } from "node:crypto";

/** A new private invite link code: 32 random bytes, safe to put in a URL. */
export function newInviteCode(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores instead of the code itself. */
export function fingerprintOf(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Invite link codes look like this; anything else is rejected without a lookup. */
export function looksLikeInviteCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(code);
}
