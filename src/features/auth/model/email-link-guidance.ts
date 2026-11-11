export type EmailLinkFlow = 'signUp' | 'passwordReset';

// On web the email link opens a browser tab and the PKCE verifier lives in that browser's storage.
// On iOS and Android the link opens the app via dailydama://auth/callback, so the real constraint
// is the device, not a browser. Web is the explicit branch so any other platform gets device wording.
const WEB_GUIDANCE: Record<EmailLinkFlow, string> = {
  signUp:
    'Open the email on this same browser, on this device, to finish creating your account. ' +
    'Daily Dama cannot complete the confirmation if you open the link somewhere else.',
  passwordReset:
    'Open the email on this same browser, on this device, to finish resetting your password. ' +
    "Daily Dama can't complete the reset if you open the link somewhere else.",
};

const DEVICE_GUIDANCE: Record<EmailLinkFlow, string> = {
  signUp:
    'Open the email on this device to finish creating your account. ' +
    'Daily Dama cannot complete the confirmation if you open the link on another device.',
  passwordReset:
    'Open the email on this device to finish resetting your password. ' +
    "Daily Dama can't complete the reset if you open the link on another device.",
};

const WEB_MISSING_VERIFIER =
  'This link only works in the browser and device you requested it from. Open your email there, or go back and request a new link from that same browser.';

const DEVICE_MISSING_VERIFIER =
  'This link only works on the device you requested it from. Open your email on that device, or go back and request a new link from there.';

export function emailLinkGuidance(platformOS: string, flow: EmailLinkFlow): string {
  return platformOS === 'web' ? WEB_GUIDANCE[flow] : DEVICE_GUIDANCE[flow];
}

export function missingVerifierCopy(platformOS: string): string {
  return platformOS === 'web' ? WEB_MISSING_VERIFIER : DEVICE_MISSING_VERIFIER;
}
