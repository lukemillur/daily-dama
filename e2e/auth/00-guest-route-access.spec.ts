import { test, expect, type Page } from '@playwright/test';

// Exit-criteria clause: 'guest access to every existing /app top-level route while Auth
// is initializing, offline, or unavailable.' auth-provider.tsx never gates Slot's render
// on authState.status (confirmed by direct read, see the T153.13 plan) -- this file is a
// black-box proof of that, not a fix for a gap.
//
// A brand-new browser (no local profile at all) is gated by the *onboarding* flow --
// src/components/app-tabs.tsx hides every tab until hasCompletedOnboarding -- which is
// an existing, Auth-independent product gate, not the thing under test here. Each test
// seeds a completed-onboarding local profile via localStorage before navigating so the
// only variable under test is the Auth network condition.

const ROUTES = ['/app/home', '/app/sesh', '/app/tricks', '/app/stats', '/app/profile'];

const ONBOARDED_PROFILE_DOCUMENT = JSON.stringify({
  version: 1,
  profile: { selectedTrickIds: [], hasCompletedOnboarding: true, kenteiRank: 5 },
});

async function seedOnboardedProfile(page: Page): Promise<void> {
  await page.addInitScript((document) => {
    window.localStorage.setItem('daily-dama:user-profile', document);
  }, ONBOARDED_PROFILE_DOCUMENT);
}

async function assertGuestRendersRoute(
  page: Page,
  route: string,
  errors: Error[],
): Promise<void> {
  const bodyText = await page.locator('body').innerText();
  expect(page.url()).toContain(route);
  expect(errors).toHaveLength(0);
  expect(bodyText.trim().length).toBeGreaterThan(20);
}

test.describe('guest access while Auth is still initializing', () => {
  for (const route of ROUTES) {
    test(route + ' renders before Auth has settled', async ({ page }) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await seedOnboardedProfile(page);
      // No wait for network idle -- asserts the route is already usable on first
      // paint, before onAuthStateChange's first callback has necessarily fired.
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertGuestRendersRoute(page, route, errors);
    });
  }
});

test.describe('guest access while Auth is offline', () => {
  for (const route of ROUTES) {
    test(route + ' renders when auth/v1 requests fail with a network error', async ({ page }) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await seedOnboardedProfile(page);
      await page.route('**/auth/v1/**', (routeHandle) => routeHandle.abort('failed'));
      await page.goto(route);
      await page.waitForTimeout(500);
      await assertGuestRendersRoute(page, route, errors);
    });
  }
});

test.describe('guest access while Auth is unavailable', () => {
  for (const route of ROUTES) {
    test(route + ' renders when auth/v1 requests return a server error', async ({ page }) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await seedOnboardedProfile(page);
      await page.route('**/auth/v1/**', (routeHandle) =>
        routeHandle.fulfill({ status: 500, body: 'unavailable' }),
      );
      await page.goto(route);
      await page.waitForTimeout(500);
      await assertGuestRendersRoute(page, route, errors);
    });
  }
});
