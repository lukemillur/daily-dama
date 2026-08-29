import { expect, test, type Page } from '@playwright/test';

import { seedConfirmedUser, type LocalSupabaseConfig } from './support/local-supabase';
import { RedactionListener } from './support/redaction-listener';

const PROFILE = JSON.stringify({
  version: 1,
  profile: { selectedTrickIds: [], hasCompletedOnboarding: true, kenteiRank: 5 },
});

function config(): LocalSupabaseConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Run this suite via .claude/scripts/run-auth-e2e.mjs, not directly.');
  return { url, serviceRoleKey };
}

async function signedInDeletionPage(page: Page): Promise<{ password: string }> {
  const email = `account-deletion-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'the-original-password-1';
  const userId = await seedConfirmedUser(config(), email, password);
  await page.addInitScript(
    ({ document, key }) => window.localStorage.setItem(key, document),
    { document: PROFILE, key: `user:${userId}:daily-dama:user-profile` },
  );
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Sign in').click();
  await page.waitForURL('**/app/home');
  await page.goto('/app/profile/account/delete');
  return { password };
}

async function fillValidForm(page: Page, password: string): Promise<void> {
  await page.getByLabel('Current password').fill(password);
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
}

test.describe('account deletion', () => {
  test('requires both a current password and exact DELETE confirmation', async ({ page }) => {
    const { password } = await signedInDeletionPage(page);
    const button = page.getByLabel('Delete account permanently');
    await expect(button).toBeDisabled();
    await page.getByLabel('Current password').fill(password);
    await expect(button).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('delete');
    await expect(button).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await expect(button).toBeEnabled();
  });

  test('wrong password is generic and offline failure remains retryable without leakage', async ({ page }) => {
    const { password } = await signedInDeletionPage(page);
    const wrongPassword = 'a-secret-wrong-password-9';
    const listener = new RedactionListener(page);
    await fillValidForm(page, wrongPassword);
    await page.getByLabel('Delete account permanently').click();
    await expect(page.getByText(/could not verify your password or session/i)).toBeVisible();
    listener.assertNeverContains(wrongPassword, 'raw');
    await page.route('**/functions/v1/delete-account', (route) => route.abort('failed'));
    await fillValidForm(page, password);
    await page.getByLabel('Delete account permanently').click();
    await expect(page.getByText(/offline/i)).toBeVisible();
  });

  test('rate-limited and successful responses use safe copy and submit success once', async ({ page }) => {
    const { password } = await signedInDeletionPage(page);
    await page.route('**/functions/v1/delete-account', async (route) => {
      await route.fulfill({ status: 429, body: JSON.stringify({ message: 'raw backend detail' }) });
    });
    await fillValidForm(page, password);
    await page.getByLabel('Delete account permanently').click();
    await expect(page.getByText(/too many attempts/i)).toBeVisible();

    let calls = 0;
    await page.unroute('**/functions/v1/delete-account');
    await page.route('**/functions/v1/delete-account', async (route) => {
      calls += 1;
      await route.fulfill({ status: 204 });
    });
    await fillValidForm(page, password);
    const button = page.getByLabel('Delete account permanently');
    await button.click();
    await button.click();
    await expect(page.getByText(/deletion is proceeding/i)).toBeVisible();
    expect(calls).toBe(1);
    await expect(button).toBeDisabled();
    expect(page.url()).not.toContain(password);
  });
});
