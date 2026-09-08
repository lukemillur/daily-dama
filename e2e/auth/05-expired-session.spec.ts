import { test, expect } from '@playwright/test';

// Exit-criteria clause: 'expired sessions.' A literal one-hour wait for the real
// jwt_expiry to elapse was rejected as impractical for a deterministic suite.
// Pragmatic simulation instead: visiting /auth/reset-password directly, with no prior
// recovery flow in this browser, exercises the exact same 'not in passwordRecovery
// status' guard that the real session_expired/session_not_found codes hit.

test('visiting reset-password with no active recovery session shows the expired-link guidance', async ({ page }) => {
  await page.goto('/auth/reset-password');
  await expect(page.getByText('This link is no longer valid.')).toBeVisible();
  await expect(
    page.getByText('Your password reset link has expired or was already used. Request a new one to continue.'),
  ).toBeVisible();
});
