import type { IdentityContext } from '@/shared/persistence/identity-context';
import { identityNamespace, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';

export function physicalKey(identity: Identity, logicalKey: string): string {
  return `${identityNamespace(identity)}:${logicalKey}`;
}

/**
 * Wraps a base `KeyValueStorage` so every read/write is namespaced by the
 * *current* identity from `context`. The identity is read fresh on every
 * call — never cached at construction time and never derived from anything
 * passed into `getItem`/`setItem` — so the physical key a call resolves to
 * can only ever come from the live identity context.
 */
export function createScopedKeyValueStorage(
  base: KeyValueStorage,
  context: Pick<IdentityContext, 'getIdentity'>,
): KeyValueStorage {
  return {
    getItem: (key) => base.getItem(physicalKey(context.getIdentity(), key)),
    setItem: (key, value) => base.setItem(physicalKey(context.getIdentity(), key), value),
  };
}
