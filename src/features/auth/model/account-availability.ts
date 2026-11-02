import { Platform } from 'react-native';

/**
 * Whether account sign-up/sign-in (and the backup promise that comes with it) works on this
 * platform. Must stay in lockstep with the `Platform.OS !== 'web'` guard in `getSupabaseClient`,
 * which makes native builds guest-only. When native auth is implemented, flip this one
 * predicate and delete the withholding branches that consume it.
 */
export function areAccountsAvailable(platformOS: string): boolean {
  return platformOS === 'web';
}

export function useAccountsAvailable(): boolean {
  return areAccountsAvailable(Platform.OS);
}

export const ACCOUNT_UNAVAILABLE_TITLE = 'Accounts are not available in the mobile app yet';
export const ACCOUNT_UNAVAILABLE_BODY =
  'Your practice is saved on this device only. Sign-up, sign-in, and backup are not available here yet.';
