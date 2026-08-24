import { test, expect } from '@playwright/test';

import { seedConfirmedUser, type LocalSupabaseConfig } from './support/local-supabase';
import { fetchLatestAuthLink } from './support/mailpit';

// This file spends the suite's entire real email_sent budget (2 sends/hour, project-wide
// on local GoTrue -- see supabase/README.md): one real signup-confirmation send and one
// real recovery send. It rides those two sends to cover six exit-criteria clauses in one
// careful sequence: signup equivalence, verification, the reused and verifier-mismatched
// callback cases, recovery equivalence, reset, and the resend-limit rejection.
//
// Deviation from the original plan: supabase.auth.admin.generateLink cannot produce a
// PKCE 'code' redirect at all (live-probed during implementation -- without a client-
// supplied code_challenge, GoTrue falls back to an implicit-flow hash-token redirect
// instead), so the reused/verifier-mismatched callback cases must come from a real
// PKCE-flow signup rather than a zero-cost admin-generated link. They are folded into
// this file's one real signup send instead of getting their own zero-cost file.
//
// Second deviation: local GoTrue's email_sent rate limit only applies with a real SMTP
// provider configured (config.toml's own comment says so), which this local stack does
// not have -- live-probed during implementation, where a 3rd real send succeeded instead
// of being rejected. The resend-limit assertion below therefore intercepts that one
// request and fulfills it with GoTrue's real over_email_send_rate_limit response shape,
// verifying the app's reaction to that response rather than the unverifiable local
// server-side enforcement.

function requiredConfig(): LocalSupabaseConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Run this suite via .claude/scripts/run-auth-e2e.mjs, not directly.');
  }
  return { url, serviceRoleKey };
}

async function extractCallbackCode(
  request: import('@playwright/test').APIRequestContext,
  authLink: string,
): Promise<string> {
  const response = await request.get(authLink, { maxRedirects: 0 });
  const location = response.headers()['location'];
  const match = location && location.match(/[?&]code=([^&]+)/);
  if (!match) throw new Error('No PKCE code param on the confirmation redirect.');
  return decodeURIComponent(match[1]);
}

test('signup, verification, callback edge cases, recovery, reset, and resend limit', async ({ browser, request }) => {
  test.setTimeout(90000);
  const config = requiredConfig();
  const newAddress = 'real-signup-' + Date.now() + '@example.com';
  const existingConfirmedAddress = 'existing-confirmed-' + Date.now() + '@example.com';
  const recoveryAddress = 'real-recovery-' + Date.now() + '@example.com';
  const neverRegisteredAddress = 'never-registered-recovery-' + Date.now() + '@example.com';
  const strongPassword = 'a-strong-enough-password-1';
  const newStrongPassword = 'a-different-strong-password-2';

  await seedConfirmedUser(config, existingConfirmedAddress, strongPassword);
  await seedConfirmedUser(config, recoveryAddress, strongPassword);

  // Step 1 (real send #1): a fresh address signs up for real through the UI. This
  // context/page is kept open (never navigated away) so its in-memory pendingEmail
  // state survives for the resend-limit step at the very end.
  const resendContext = await browser.newContext();
  const resendPage = await resendContext.newPage();
  await resendPage.goto('/auth/sign-up');
  await resendPage.getByLabel('Email').fill(newAddress);
  await resendPage.getByLabel('Password', { exact: true }).fill(strongPassword);
  await resendPage.getByLabel('Confirm password').fill(strongPassword);
  await resendPage.getByLabel('Sign up').click();
  const newAddressCheckEmailCopy = resendPage.getByText(
    'If that email is available, we have sent a link to confirm your account.',
  );
  await expect(newAddressCheckEmailCopy).toBeVisible();

  // Signup equivalence, 'existing' side, zero cost: an already-confirmed address gets
  // identity_already_exists from GoTrue (no mail sent), which the app collapses onto
  // the identical check-email UI a true signup shows -- see sign-up-screen.tsx.
  const existingContext = await browser.newContext();
  const existingPage = await existingContext.newPage();
  await existingPage.goto('/auth/sign-up');
  await existingPage.getByLabel('Email').fill(existingConfirmedAddress);
  await existingPage.getByLabel('Password', { exact: true }).fill(strongPassword);
  await existingPage.getByLabel('Confirm password').fill(strongPassword);
  await existingPage.getByLabel('Sign up').click();
  const existingAddressCheckEmailCopy = existingPage.getByText(
    'If that email is available, we have sent a link to confirm your account.',
  );
  await expect(existingAddressCheckEmailCopy).toBeVisible();
  await existingContext.close();

  const authLink = await fetchLatestAuthLink(newAddress);
  expect(authLink).toBeTruthy();
  const code = await extractCallbackCode(request, authLink as string);

  // Verifier-mismatched: a browser context that never called signUp has no matching
  // PKCE verifier stored, on an as-yet-unused code.
  const mismatchContext = await browser.newContext();
  const mismatchPage = await mismatchContext.newPage();
  await mismatchPage.goto('/auth/callback?code=' + code);
  await expect(
    mismatchPage.getByText(/only works in the browser and device you requested it from/),
  ).toBeVisible();
  await mismatchContext.close();

  // The real owning browser (same PKCE verifier as the signUp call) exchanges the code
  // successfully. This must NOT reuse resendContext's own page: supabase-js listens for
  // cross-tab storage events, so a successful sign-in here would sync into resendPage and
  // redirect it away from /auth/check-email before the resend-limit step below runs.
  // Cloning resendContext's storageState (which carries the PKCE verifier) into a brand
  // new, independent context gives the matching verifier without sharing a live tab whose
  // React state would react to the resulting session change.
  const resendStorageState = await resendContext.storageState();
  const verifyContext = await browser.newContext({ storageState: resendStorageState });
  const verifyPage = await verifyContext.newPage();
  await verifyPage.goto('/auth/callback?code=' + code);
  await verifyPage.waitForURL('**/app/home');

  // Reused: the same code, replayed by the same browser that already consumed it.
  await verifyPage.goto('/auth/callback?code=' + code);
  await expect(
    verifyPage.getByText(/only works in the browser and device you requested it from/),
  ).toBeVisible();
  await verifyContext.close();

  // Recovery equivalence, 'unknown' side, zero cost -- resetPasswordForEmail resolves
  // identically for known and unknown addresses (enumeration-safe), so check this side
  // first, before the real recovery send below.
  const unknownRecoveryContext = await browser.newContext();
  const unknownRecoveryPage = await unknownRecoveryContext.newPage();
  await unknownRecoveryPage.goto('/auth/forgot-password');
  await unknownRecoveryPage.getByLabel('Email').fill(neverRegisteredAddress);
  await unknownRecoveryPage.getByLabel('Send reset link').click();
  const unknownRecoveryCopy = unknownRecoveryPage.getByText(
    "If an account exists for that email, we've sent a link to reset the password.",
  );
  await expect(unknownRecoveryCopy).toBeVisible();
  await unknownRecoveryContext.close();

  // Real send #2, plus recovery equivalence's 'known' side and reset.
  const recoveryContext = await browser.newContext();
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto('/auth/forgot-password');
  await recoveryPage.getByLabel('Email').fill(recoveryAddress);
  await recoveryPage.getByLabel('Send reset link').click();
  const knownRecoveryCopy = recoveryPage.getByText(
    "If an account exists for that email, we've sent a link to reset the password.",
  );
  await expect(knownRecoveryCopy).toBeVisible();

  const recoveryAuthLink = await fetchLatestAuthLink(recoveryAddress);
  expect(recoveryAuthLink).toBeTruthy();
  await recoveryPage.goto(recoveryAuthLink as string);
  await recoveryPage.waitForURL('**/auth/reset-password');
  await recoveryPage.getByLabel('New password', { exact: true }).fill(newStrongPassword);
  await recoveryPage.getByLabel('Confirm new password').fill(newStrongPassword);
  await recoveryPage.getByLabel('Set new password').click();
  await expect(recoveryPage.getByText('Your password has been updated.')).toBeVisible();
  await recoveryContext.close();

  const signInAfterResetContext = await browser.newContext();
  const signInAfterResetPage = await signInAfterResetContext.newPage();
  await signInAfterResetPage.goto('/auth/sign-in');
  await signInAfterResetPage.getByLabel('Email').fill(recoveryAddress);
  await signInAfterResetPage.getByLabel('Password', { exact: true }).fill(newStrongPassword);
  await signInAfterResetPage.getByLabel('Sign in').click();
  await signInAfterResetPage.waitForURL('**/app/home');
  await signInAfterResetContext.close();

  // Resend-limit: local GoTrue's email_sent rate limit is a no-op without a real SMTP
  // provider configured (see config.toml's own comment: "Requires auth.email.smtp to be
  // enabled") -- confirmed live during implementation, where a 3rd real send succeeded
  // instead of being rejected. That makes the *server-side* limit itself unverifiable
  // against local Mailpit, so this intercepts the 3rd resend request and fulfills it with
  // GoTrue's real over_email_send_rate_limit shape instead, proving what is actually in
  // scope here: the app correctly renders the rate-limited copy for that response. See
  // supabase/README.md for the same note.
  await resendPage.route('**/auth/v1/resend**', async (routeHandle) => {
    await routeHandle.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }),
    });
  });
  await resendPage.getByLabel('Resend').click();
  await expect(resendPage.getByText('Too many attempts. Wait a moment and try again.')).toBeVisible();
  await resendContext.close();
});
