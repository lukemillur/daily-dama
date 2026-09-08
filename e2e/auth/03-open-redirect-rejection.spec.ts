import { test, expect } from '@playwright/test';

// Exit-criteria clause: 'open-redirect rejection.' auth-provider.tsx hardcodes every
// redirect to window.location.origin + '/auth/callback' -- there is no code path that
// reads a redirect destination from a query/route param, so this is a black-box proof
// that an attacker-shaped query string on the page cannot change the outgoing
// redirect_to sent to GoTrue, not a test of app-side allow-list logic (none exists).
//
// Both requests below are intercepted and never allowed to actually reach local GoTrue
// (fulfilled with a mocked response instead) so this file spends zero email_sent budget
// -- only the outgoing redirect_to query param is under test here.

const ATTACKER_SUFFIX = '?redirect=https://evil.example.com&next=https://evil.example.com';

test('sign-up ignores an attacker-shaped redirect param in the outgoing redirect_to', async ({ page }) => {
  let capturedUrl: URL | undefined;
  await page.route('**/auth/v1/signup**', async (routeHandle) => {
    capturedUrl = new URL(routeHandle.request().url());
    await routeHandle.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"blocked-for-test"}' });
  });
  await page.goto('/auth/sign-up' + ATTACKER_SUFFIX);
  await page.getByLabel('Email').fill('open-redirect-' + Date.now() + '@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-strong-enough-password-1');
  await page.getByLabel('Confirm password').fill('a-strong-enough-password-1');
  await page.getByLabel('Sign up').click();
  await expect.poll(() => capturedUrl).toBeDefined();
  expect(capturedUrl!.searchParams.get('redirect_to')).toBe('http://localhost:8081/auth/callback');
});

test('forgot-password ignores an attacker-shaped redirect param in the outgoing redirect_to', async ({ page }) => {
  let capturedUrl: URL | undefined;
  await page.route('**/auth/v1/recover**', async (routeHandle) => {
    capturedUrl = new URL(routeHandle.request().url());
    await routeHandle.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/auth/forgot-password' + ATTACKER_SUFFIX);
  await page.getByLabel('Email').fill('open-redirect-recover-' + Date.now() + '@example.com');
  await page.getByLabel('Send reset link').click();
  await expect.poll(() => capturedUrl).toBeDefined();
  expect(capturedUrl!.searchParams.get('redirect_to')).toBe('http://localhost:8081/auth/callback');
});
