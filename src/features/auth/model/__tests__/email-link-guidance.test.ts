import { describe, expect, it } from '@jest/globals';

import { emailLinkGuidance, missingVerifierCopy } from '@/features/auth/model/email-link-guidance';

describe('emailLinkGuidance', () => {
  it('keeps the exact web wording', () => {
    expect(emailLinkGuidance('web', 'signUp')).toBe(
      'Open the email on this same browser, on this device, to finish creating your account. Daily Dama cannot complete the confirmation if you open the link somewhere else.',
    );
    expect(emailLinkGuidance('web', 'passwordReset')).toBe(
      "Open the email on this same browser, on this device, to finish resetting your password. Daily Dama can't complete the reset if you open the link somewhere else.",
    );
  });

  it.each(['ios', 'android'])('names this device and never says browser on %s', (os) => {
    for (const flow of ['signUp', 'passwordReset'] as const) {
      const text = emailLinkGuidance(os, flow);
      expect(text).toMatch(/this device/i);
      expect(text).not.toMatch(/browser/i);
    }
  });
});

describe('missingVerifierCopy', () => {
  it('keeps the exact web wording', () => {
    expect(missingVerifierCopy('web')).toBe(
      'This link only works in the browser and device you requested it from. Open your email there, or go back and request a new link from that same browser.',
    );
  });

  it.each(['ios', 'android'])('uses device wording on %s', (os) => {
    const text = missingVerifierCopy(os);
    expect(text).toMatch(/device/i);
    expect(text).not.toMatch(/browser/i);
  });
});
