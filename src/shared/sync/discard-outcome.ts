import type { SyncDomain } from '@/shared/sync/domain';

export type DomainDiscardOutcome =
  | { readonly status: 'discarded' }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'superseded' };

export interface DiscardFailure {
  readonly domain: SyncDomain;
  readonly error: unknown;
}

export type DiscardAllPendingResult =
  | { readonly status: 'discarded' }
  | { readonly status: 'failed'; readonly failures: readonly DiscardFailure[] }
  | { readonly status: 'superseded' };

/**
 * Aggregates per-domain discard outcomes with precedence superseded > failed > discarded: if any
 * domain reports superseded, the identity moved underneath the whole flow and the guard is about
 * to be reset anyway, so per-domain failure copy for a stale identity would be noise. Otherwise
 * any failure makes the whole attempt a partial failure (the domains that did succeed stay
 * durably cleared; there is no rollback), and only when every domain discarded cleanly does the
 * aggregate report discarded.
 */
export function aggregateDiscardOutcomes(
  entries: readonly (readonly [SyncDomain, DomainDiscardOutcome])[],
): DiscardAllPendingResult {
  let anySuperseded = false;
  const failures: DiscardFailure[] = [];

  for (const [domain, outcome] of entries) {
    if (outcome.status === 'superseded') {
      anySuperseded = true;
    } else if (outcome.status === 'failed') {
      failures.push({ domain, error: outcome.error });
    }
  }

  if (anySuperseded) return { status: 'superseded' };
  if (failures.length > 0) return { status: 'failed', failures };
  return { status: 'discarded' };
}
