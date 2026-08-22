export type Identity =
  | { readonly kind: 'guest' }
  | { readonly kind: 'user'; readonly userId: string };

export const GUEST_IDENTITY: Identity = { kind: 'guest' };

// Supabase auth.users.id is always a UUID. Validating that shape is what makes
// "malformed identity rejected" concretely testable, and it also protects the
// key-namespacing scheme below: a userId containing ':' could otherwise be used
// to forge a colliding physical key across namespaces.
const VERIFIED_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidVerifiedUserId(value: unknown): value is string {
  return typeof value === 'string' && VERIFIED_USER_ID_PATTERN.test(value);
}

// The only sanctioned way to construct a `user:` identity. Returns undefined
// ("rejected") for anything that isn't a validly-shaped id — callers must not
// have any other path to producing a `{ kind: 'user' }` value.
export function createUserIdentity(userId: unknown): Identity | undefined {
  return isValidVerifiedUserId(userId) ? { kind: 'user', userId } : undefined;
}

export function identitiesEqual(a: Identity, b: Identity): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'user' && b.kind === 'user' ? a.userId === b.userId : true;
}

// Physical-namespace prefix for a logical key. Exported so a future migration
// wrapper (T156.2) can compute both the new scoped key and the old unscoped
// legacy key without duplicating this scheme.
export function identityNamespace(identity: Identity): string {
  return identity.kind === 'guest' ? 'guest' : `user:${identity.userId}`;
}
