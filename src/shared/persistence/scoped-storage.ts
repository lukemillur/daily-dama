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

/**
 * Wraps `createScopedKeyValueStorage` with a one-time backward-compat fallback for guest data
 * written before identity namespacing existed, when every domain lived at the bare
 * logical key (e.g. `daily-dama:user-profile`) instead of `guest:daily-dama:user-profile`.
 *
 * On a scoped miss while the current identity is `guest`, falls back to the legacy bare key on
 * `base`. A legacy hit is written through to the namespaced key so every subsequent read/write
 * uses the namespaced key going forward -- the fallback path is only ever exercised once per
 * domain per device. The legacy key itself is deliberately left in place (no forensic erasure).
 *
 * `user:<uuid>` identities never had legacy data (that namespace didn't exist before scoping), so the
 * fallback is skipped entirely for them -- they never touch the bare key.
 */
export function createGuestMigratingStorage(
  base: KeyValueStorage,
  context: Pick<IdentityContext, 'getIdentity'>,
): KeyValueStorage {
  const scoped = createScopedKeyValueStorage(base, context);

  return {
    getItem: async (key) => {
      const scopedValue = await scoped.getItem(key);
      if (scopedValue !== null) return scopedValue;
      if (context.getIdentity().kind !== 'guest') return null;

      const legacyValue = await base.getItem(key);
      if (legacyValue === null) return null;

      await scoped.setItem(key, legacyValue);
      return legacyValue;
    },
    setItem: (key, value) => scoped.setItem(key, value),
  };
}
