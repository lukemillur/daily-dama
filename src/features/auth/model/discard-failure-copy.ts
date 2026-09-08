import type { SyncDomain } from "@/shared/sync/domain";

export const DISCARD_FAILURE_DOMAIN_LABELS: Record<SyncDomain, string> = {
  profile: "profile",
  customTricks: "custom tricks",
  practiceHistory: "practice history",
  goals: "goals",
  notes: "notes",
};

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Actionable copy for a discard attempt that left at least one domain's
// pending operations unwritten: names what failed, states that it is still
// safe (nothing was lost), and gives a next step. The empty-list case is
// defensive (an unknown/rejected discard) and still gives the user a path
// forward without naming a domain we don't actually know failed.
export function describeDiscardFailure(domains: readonly SyncDomain[]): string {
  if (domains.length === 0) {
    return "Could not discard your unsynced changes on this device. They are still stored here. Try again — you are still logged in.";
  }
  const list = joinWithAnd(domains.map((domain) => DISCARD_FAILURE_DOMAIN_LABELS[domain]));
  return `Could not discard your ${list} changes on this device. They are still stored here. Free up storage or try again — you are still logged in.`;
}
