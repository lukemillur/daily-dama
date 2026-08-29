import { identityNamespace, type Identity } from '@/shared/persistence/identity';

/**
 * A minimal AsyncStorage-shaped seam for `purgeIdentityNamespace` below.
 * Deliberately not `KeyValueStorage` (in `storage.ts`), which only declares
 * `getItem`/`setItem` -- a full-namespace purge needs to enumerate and bulk
 * remove keys, which that interface has no way to express.
 */
export interface NamespacePurgeStorage {
  readonly getAllKeys: () => Promise<readonly string[]>;
  readonly multiRemove: (keys: readonly string[]) => Promise<void>;
}

/**
 * Removes every physical AsyncStorage key belonging to a verified user's
 * identity namespace (`user:<uuid>:...`). Every identity-scoped domain
 * document (profile, custom tricks, practice history, goals, notes),
 * guest-import progress, and the sync-status metadata key are all
 * physically namespaced this way via `identityNamespace`/`physicalKey` in
 * `scoped-storage.ts`, and each domain's outbox/conflicts are baked into
 * that same document rather than stored separately -- so this one prefix
 * sweep is a complete purge of everything credentials-adjacent that this
 * account ever wrote.
 *
 * Typed to only accept a `{ kind: 'user' }` identity (never `GUEST_IDENTITY`)
 * so a caller can never accidentally purge the live guest namespace -- this
 * mirrors the "only sanctioned way" pattern `createUserIdentity` already
 * uses for constructing a user identity in the first place.
 *
 * Accepted prototype cleanup, not claimed forensic erasure (see T161.5's
 * Notes) -- this is an ordinary AsyncStorage removal, not secure wiping.
 */
export async function purgeIdentityNamespace(
  storage: NamespacePurgeStorage,
  identity: Identity & { kind: 'user' },
): Promise<void> {
  const prefix = `${identityNamespace(identity)}:`;
  const allKeys = await storage.getAllKeys();
  const matches = allKeys.filter((key) => key.startsWith(prefix));

  if (matches.length === 0) return;

  await storage.multiRemove(matches);
}
