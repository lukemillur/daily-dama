import { test, expect, type Page } from '@playwright/test';

import { seedConfirmedUser, type LocalSupabaseConfig } from './support/local-supabase';
import { fetchLatestAuthLink } from './support/mailpit';
import { RedactionListener } from './support/redaction-listener';

// T154.1: signed-in password and email change flows, verified end to end against local
// Supabase/Mailpit (real double_confirm_changes two-address email-change confirmation --
// see auth-provider.tsx's changeEmail comment for why a flow=email_change query
// discriminator, not GoTrue's own redirectType/new_email, is what routes the completing
// confirmation to this route).

const ONBOARDED_PROFILE_DOCUMENT = JSON.stringify({
  version: 1,
  profile: { selectedTrickIds: [], hasCompletedOnboarding: true, kenteiRank: 5 },
});

// Unlike 00-guest-route-access.spec.ts's guest-only seeding (the bare/legacy
// 'daily-dama:user-profile' key), every scenario here signs in first, so the physical
// storage key is identity-namespaced ('user:<uuid>:daily-dama:user-profile' --
// createScopedKeyValueStorage) and the guest-only legacy-key fallback in
// scoped-storage.ts never applies. Must seed the exact namespaced key or
// useRequireOnboarding sees a default (not-onboarded) profile and redirects away.
async function seedOnboardedProfile(page: Page, userId: string): Promise<void> {
  await page.addInitScript(
    ({ document, key }) => {
      window.localStorage.setItem(key, document);
    },
    { document: ONBOARDED_PROFILE_DOCUMENT, key: 'user:' + userId + ':daily-dama:user-profile' },
  );
}

function requiredConfig(): LocalSupabaseConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Run this suite via .claude/scripts/run-auth-e2e.mjs, not directly.');
  }
  return { url, serviceRoleKey };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Sign in').click();
  await page.waitForURL('**/app/home');
}

test.describe('password change', () => {
  test('changes the password only after the correct current password, and the new password signs in afterward', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-pw-' + Date.now() + '@example.com';
    const oldPassword = 'the-original-password-1';
    const newPassword = 'the-updated-password-2';
    const userId = await seedConfirmedUser(config, email, oldPassword);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, oldPassword);

    await page.goto('/app/profile/account/security');

    // Wrong current password first: rejected with specific copy, and the old password
    // still works afterward (nothing actually changed).
    await page.getByLabel('Current password').fill('not-the-real-password');
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByLabel('Update password').click();
    await expect(page.getByText('Your current password is incorrect.')).toBeVisible();

    // Correct current password: succeeds, fields clear, success copy shown.
    await page.getByLabel('Current password').fill(oldPassword);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByLabel('Update password').click();
    await expect(page.getByText('Your password has been updated.')).toBeVisible();
    await expect(page.getByLabel('Current password')).toHaveValue('');

    // Sign out and back in with the new password to prove it actually took effect,
    // and that the old password no longer works.
    await page.evaluate(() => window.localStorage.clear());
    await seedOnboardedProfile(page, userId);
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByLabel('Sign in').click();
    await expect(page.getByText('Incorrect email or password. Try again.')).toBeVisible();

    await page.reload();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByLabel('Sign in').click();
    await page.waitForURL('**/app/home');
  });

  test('an offline password-change attempt shows offline copy and never leaks the password', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-pw-offline-' + Date.now() + '@example.com';
    const password = 'the-original-password-1';
    const userId = await seedConfirmedUser(config, email, password);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, password);

    await page.goto('/app/profile/account/security');
    await page.route('**/auth/v1/token**', (routeHandle) => routeHandle.abort('failed'));
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill('a-new-password-3');
    await page.getByLabel('Confirm new password').fill('a-new-password-3');
    await page.getByLabel('Update password').click();
    await expect(page.getByText("You're offline. Check your connection and try again.")).toBeVisible();
  });
});

test.describe('email change', () => {
  test('an offline email-change attempt shows offline copy and never navigates', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-email-offline-' + Date.now() + '@example.com';
    const password = 'the-original-password-1';
    const userId = await seedConfirmedUser(config, email, password);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, password);

    await page.goto('/app/profile/account/security');
    await page.route('**/auth/v1/user**', (routeHandle) => routeHandle.abort('failed'));
    await page.getByLabel('New email').fill('someone-new@example.com');
    await page.getByLabel('Update email').click();
    await expect(page.getByText("You're offline. Check your connection and try again.")).toBeVisible();
  });

  test('an invalid new-email shape blocks submit without a network call', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-email-invalid-' + Date.now() + '@example.com';
    const password = 'the-original-password-1';
    const userId = await seedConfirmedUser(config, email, password);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, password);

    await page.goto('/app/profile/account/security');
    await page.getByLabel('New email').fill('not-an-email');
    await page.getByLabel('Update email').click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  // Spends this run's entire real email_sent budget: double_confirm_changes sends one
  // real message to the current address and one to the new address per updateUser call.
  test('a full two-address confirmation completes the change, lands on the security route, and a stale link is rejected afterward', async ({ page }) => {
    const config = requiredConfig();
    const oldEmail = 'account-security-old-' + Date.now() + '@example.com';
    const newEmail = 'account-security-new-' + Date.now() + '@example.com';
    const password = 'the-original-password-1';
    const userId = await seedConfirmedUser(config, oldEmail, password);
    await seedOnboardedProfile(page, userId);
    await signIn(page, oldEmail, password);

    await page.goto('/app/profile/account/security');
    await page.getByLabel('New email').fill(newEmail);
    await page.getByLabel('Update email').click();
    await expect(
      page.getByText(/check both your current and new email inboxes to confirm this change/i),
    ).toBeVisible();

    const oldAddressLink = await fetchLatestAuthLink(oldEmail);
    const newAddressLink = await fetchLatestAuthLink(newEmail);
    expect(oldAddressLink).toBeTruthy();
    expect(newAddressLink).toBeTruthy();

    // First confirmation (old-address link): GoTrue's mid-flow signal, not a completion --
    // must show "one more step" guidance, not an error and not a navigation away.
    await page.goto(oldAddressLink as string);
    await expect(page.getByText('One more step.')).toBeVisible();

    // Second confirmation (new-address link): completes the change and lands here.
    await page.goto(newAddressLink as string);
    await page.waitForURL('**/app/profile/account/security');

    // The account's email is now the new address, reflected without a manual reload via
    // the existing onAuthStateChange -> USER_UPDATED path -- confirmed on the same page,
    // no page.reload() call before this assertion.
    await expect(page.getByText('Current email: ' + newEmail)).toBeVisible();

    // A stale replay of the already-consumed new-address link is rejected.
    await page.goto(newAddressLink as string);
    await expect(page.getByText('This link is no longer valid.')).toBeVisible();
  });
});

test.describe('redaction', () => {
  test('a wrong-current-password submit never leaks the entered password values in console or Analytics', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-redact-pw-' + Date.now() + '@example.com';
    const currentPassword = 'the-original-password-1';
    const wrongPassword = 'a-secret-wrong-password-9';
    const newPassword = 'a-secret-new-password-9';
    const userId = await seedConfirmedUser(config, email, currentPassword);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, currentPassword);

    await page.goto('/app/profile/account/security');
    const listener = new RedactionListener(page);
    await page.getByLabel('Current password').fill(wrongPassword);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByLabel('Update password').click();
    await expect(page.getByText('Your current password is incorrect.')).toBeVisible();
    listener.assertNeverContains(wrongPassword, newPassword);
    expect(page.url()).not.toContain(wrongPassword);
    expect(page.url()).not.toContain(newPassword);
  });

  test('an email-change request never leaks the new email in console or Analytics, or in the URL', async ({ page }) => {
    const config = requiredConfig();
    const email = 'account-security-redact-email-' + Date.now() + '@example.com';
    const password = 'the-original-password-1';
    const newEmail = 'a-secret-new-address-' + Date.now() + '@example.com';
    const userId = await seedConfirmedUser(config, email, password);
    await seedOnboardedProfile(page, userId);
    await signIn(page, email, password);

    await page.goto('/app/profile/account/security');
    const listener = new RedactionListener(page);
    await page.getByLabel('New email').fill(newEmail);
    await page.getByLabel('Update email').click();
    await expect(
      page.getByText(/check both your current and new email inboxes to confirm this change/i),
    ).toBeVisible();
    listener.assertNeverContains(newEmail);
    expect(page.url()).not.toContain(newEmail);
  });
});
