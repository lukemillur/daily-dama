import { signupInviteBody } from './signup-invite-copy';

describe('signupInviteBody', () => {
  it('keeps the original browser wording on web', () => {
    expect(signupInviteBody('web')).toBe(
      'Right now your practice history only lives on this device. Sign up to keep it if you switch devices or clear your browser.',
    );
  });

  it.each(['ios', 'android', 'windows'])('uses device wording without browser text on %s', (os) => {
    const body = signupInviteBody(os);
    expect(body).toContain('this device');
    expect(body).toContain("app's data");
    expect(body).not.toMatch(/browser/i);
  });

  it('uses identical wording on iOS and Android', () => {
    expect(signupInviteBody('ios')).toBe(signupInviteBody('android'));
  });
});
