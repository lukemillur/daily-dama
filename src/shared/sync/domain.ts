export const SYNC_DOMAINS = [
  'profile',
  'customTricks',
  'practiceHistory',
  'goals',
  'notes',
] as const;

export type SyncDomain = (typeof SYNC_DOMAINS)[number];

export function isSyncDomain(value: unknown): value is SyncDomain {
  return typeof value === 'string' && (SYNC_DOMAINS as readonly string[]).includes(value);
}
