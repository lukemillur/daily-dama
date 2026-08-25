import { test, expect } from '@playwright/test';

// Exit-criteria clause: 'missing/malformed ... callbacks.' The reused and
// verifier-mismatched callback scenarios live in 04-real-email-flows.spec.ts instead --
// see that file's top comment for why (a real PKCE-flow signup, not an admin-generated
// link, turned out to be required to produce a code any browser can exchange at all,
// discovered by live-probing supabase.auth.admin.generateLink against local GoTrue
// during implementation). Missing/malformed need no code at all, so they stay here,
// zero email spend, independent of that budget-sharing constraint.

test('a callback with no code param shows the link-invalid guidance instead of crashing', async ({ page }) => {
  await page.goto('/auth/callback');
  await expect(page.getByText('This link is no longer valid.')).toBeVisible();
});

test('a malformed callback code shows the link-invalid guidance instead of crashing', async ({ page }) => {
  await page.goto('/auth/callback?code=this-is-not-a-real-pkce-code-value');
  await expect(page.getByText('This link is no longer valid.')).toBeVisible();
});
