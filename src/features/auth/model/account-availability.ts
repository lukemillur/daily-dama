import { Platform } from 'react-native';

/**
 * Whether account sign-up/sign-in (and the backup promise that comes with it) works on this
 * platform. Web, iOS and Android all construct a Supabase client (native persists the session
 * through the encrypted storage adapter), so this is true on each. The withholding branches that
 * consume it are retired by the remaining native-auth tickets.
 */
export function areAccountsAvailable(platformOS: string): boolean {
  return platformOS === 'web' || platformOS === 'ios' || platformOS === 'android';
}

export function useAccountsAvailable(): boolean {
  return areAccountsAvailable(Platform.OS);
}

export const ACCOUNT_UNAVAILABLE_TITLE = 'Accounts are not available in the mobile app yet';
export const ACCOUNT_UNAVAILABLE_BODY =
  'Your practice is saved on this device only. Sign-up, sign-in, and backup are not available here yet.';
