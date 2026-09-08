import { test, expect } from '@playwright/test';

import { seedConfirmedUser, type LocalSupabaseConfig } from './support/local-supabase';

// Exit-criteria clause: 'unknown/wrong-password sign-in equivalence.' Zero email spend --
// seeds one confirmed user via the admin API, then proves the sign-in screen renders
// byte-identical error copy for a wrong password against a real account and for a
// never-registered email, per categorizeAuthError's invalid_credentials/user_not_found
// enumeration-defense collapse.

function requiredConfig(): LocalSupabaseConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Run this suite via .claude/scripts/run-auth-e2e.mjs, not directly.');
  }
  return { url, serviceRoleKey };
}

const KNOWN_PASSWORD = 'correct-horse-battery-1';
const WRONG_PASSWORD = 'incorrect-horse-battery-1';
const EXPECTED_COPY = 'Incorrect email or password. Try again.';

test('wrong password and unknown email render byte-identical sign-in error copy', async ({ page }) => {
  const config = requiredConfig();
  const knownEmail = 'sign-in-equiv-' + Date.now() + '@example.com';
  const unknownEmail = 'never-registered-' + Date.now() + '@example.com';
  await seedConfirmedUser(config, knownEmail, KNOWN_PASSWORD);

  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(knownEmail);
  await page.getByLabel('Password', { exact: true }).fill(WRONG_PASSWORD);
  await page.getByLabel('Sign in').click();
  const wrongPasswordError = page.getByText(EXPECTED_COPY);
  await expect(wrongPasswordError).toBeVisible();

  await page.reload();
  await page.getByLabel('Email').fill(unknownEmail);
  await page.getByLabel('Password', { exact: true }).fill(WRONG_PASSWORD);
  await page.getByLabel('Sign in').click();
  const unknownEmailError = page.getByText(EXPECTED_COPY);
  await expect(unknownEmailError).toBeVisible();
});
