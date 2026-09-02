import { test, expect } from '@playwright/test';

import { RedactionListener } from './support/redaction-listener';

// Exit-criteria clause: 'application-log/Analytics redaction.' The boundary covers
// application-owned console calls and Vercel Analytics events only -- Supabase's own
// service logs and browser network tooling are explicitly out of scope (see the task's
// own notes), so RedactionListener only watches console output and the Analytics
// collection request, not every network call the page makes.

test('wrong-password sign-in never leaks the entered email or password', async ({ page }) => {
  const listener = new RedactionListener(page);
  const email = 'redaction-check-' + Date.now() + '@example.com';
  const password = 'a-secret-password-1';
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Sign in').click();
  await expect(page.getByText('Incorrect email or password. Try again.')).toBeVisible();
  listener.assertNeverContains(email, password);
});

test('an offline signup attempt never leaks the entered email or password', async ({ page }) => {
  const listener = new RedactionListener(page);
  const email = 'redaction-offline-' + Date.now() + '@example.com';
  const password = 'a-secret-password-2';
  await page.route('**/auth/v1/signup**', (routeHandle) => routeHandle.abort('failed'));
  await page.goto('/auth/sign-up');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('Sign up').click();
  await expect(page.getByText('You are offline. Check your connection and try again.')).toBeVisible();
  listener.assertNeverContains(email, password);
});

test('a callback error never leaks the raw code param', async ({ page }) => {
  const listener = new RedactionListener(page);
  const rawCode = 'super-secret-raw-code-value-should-never-leak';
  await page.goto('/auth/callback?code=' + rawCode);
  await expect(page.getByText('This link is no longer valid.')).toBeVisible();
  listener.assertNeverContains(rawCode);
});

test('a forgot-password submission never leaks the entered email', async ({ page }) => {
  const listener = new RedactionListener(page);
  const email = 'redaction-forgot-' + Date.now() + '@example.com';
  await page.goto('/auth/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Send reset link').click();
  await expect(page.getByText('Check your email.')).toBeVisible();
  listener.assertNeverContains(email);
});
