// Web history lives in browser storage, so browser-clearing is the loss case there. Native
// history lives in app data, so that wording would be wrong. Web is the explicit branch so any
// other platform gets device wording.
export function signupInviteBody(platformOS: string): string {
  if (platformOS === 'web') {
    return 'Right now your practice history only lives on this device. Sign up to keep it if you switch devices or clear your browser.';
  }
  return "Right now your practice history only lives on this device. Sign up to keep it if you switch devices or delete the app's data.";
}
