import { resolveTheme, type ResolvedTheme } from '@/features/profile/state/use-resolved-theme';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { deserializeUserProfile, USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

/**
 * Synchronously resolves the full theme (background/accent/text and their derived fields) from a
 * raw key/value read, for use before any provider (`IdentityProvider`, `UserProfileProvider`)
 * hydration path completes -- specifically the `/auth/*` route group, which renders outside both
 * of those providers and must not gate first paint on their hydration. Do not reintroduce that
 * gate here.
 *
 * Unlike `read-cached-theme-background.ts` and `read-cached-onboarding-status.ts` (the two
 * existing pre-hydration cache readers, both older than identity-scoped storage), this
 * reads the *identity-scoped* guest key (`guest:daily-dama:user-profile`) first, falling back to
 * the bare legacy key only if the scoped read is empty -- mirroring
 * `createGuestMigratingStorage`'s own read order. Do not "simplify" this back to a bare-key read
 * to match those two older helpers: `UserProfileProvider` has persisted through
 * `createGuestMigratingStorage`, which writes every value to the scoped physical
 * key and only ever falls back to the bare key as a one-time migration read. Reading only the
 * bare key here would silently show the default palette for any user who onboarded after
 * identity-scoped storage shipped.
 * This is a read-only mirror of that fallback order -- it must never write anything back; that
 * stays `UserProfileProvider`'s job once it eventually mounts under `/app/*`.
 *
 * `/auth/*` has no live identity resolution available (it renders entirely outside
 * `IdentityProvider`), so this always reads the guest-scoped key regardless of which of the four
 * auth screens is calling it. For `reset-password` specifically (reached via a real
 * `user:<uuid>` recovery session, not a guest one) this is a deliberate, documented
 * approximation: it renders that account's locally-cached-as-guest theme if this device happens
 * to still have one, and otherwise falls back to today's default palette -- never worse than
 * today, just not personalized to a recovering account's synced theme when it isn't guest-cached
 * on this device.
 */
export function readCachedGuestTheme(getItem: (key: string) => string | null): ResolvedTheme {
  try {
    const serialized = getItem(GUEST_SCOPED_KEY) ?? getItem(USER_PROFILE_STORAGE_KEY);
    if (serialized === null) return resolveTheme({});
    const profile = deserializeUserProfile(serialized);
    return resolveTheme({
      themeBackgroundColor: profile?.themeBackgroundColor,
      themeAccentColor: profile?.themeAccentColor,
      themeTextColor: profile?.themeTextColor,
    });
  } catch {
    return resolveTheme({});
  }
}
