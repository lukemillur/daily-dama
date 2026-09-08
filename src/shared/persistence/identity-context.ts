import { GUEST_IDENTITY, identitiesEqual, type Identity } from '@/shared/persistence/identity';

export interface IdentityContext {
  readonly getIdentity: () => Identity;
  readonly getGeneration: () => number;
  readonly setIdentity: (next: Identity) => number; // returns the (possibly unchanged) generation
  readonly isCurrentGeneration: (captured: number) => boolean;
}

export function createIdentityContext(initial: Identity = GUEST_IDENTITY): IdentityContext {
  let identity = initial;
  let generation = 0;

  return {
    getIdentity: () => identity,
    getGeneration: () => generation,
    setIdentity: (next) => {
      if (identitiesEqual(identity, next)) return generation; // no-op: same identity, no new generation
      identity = next;
      generation += 1;
      return generation;
    },
    isCurrentGeneration: (captured) => captured === generation,
  };
}

// Convenience wrapper for the exact pattern T156.2 needs in every provider's
// hydration effect: capture the generation before starting async work, then
// discard the result if the identity moved on while it was in flight.
export type GenerationGuardedResult<T> =
  | { readonly status: 'applied'; readonly value: T }
  | { readonly status: 'stale' };

export async function withGenerationGuard<T>(
  context: IdentityContext,
  operation: () => Promise<T>,
): Promise<GenerationGuardedResult<T>> {
  const generation = context.getGeneration();
  const value = await operation();
  return context.isCurrentGeneration(generation)
    ? { status: 'applied', value }
    : { status: 'stale' };
}
