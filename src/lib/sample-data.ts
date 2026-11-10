/**
 * Placeholder data for the layout shell (build step 1). Replaced by real
 * Supabase data from step 2 on. Nothing here is saved anywhere.
 */

export const SAMPLE_USER = {
  name: "Christina",
  initials: "C",
  orgName: "Acme Partners",
};

export const SAMPLE_SPACES = [
  { key: "EN", name: "Engineering" },
  { key: "PP", name: "Partner Programs" },
] as const;

/** Items in Needs your attention, shown as the count next to Home. */
export const SAMPLE_ATTENTION_COUNT = 3;

export function spaceHref(key: string) {
  return `/spaces/${key.toLowerCase()}`;
}
