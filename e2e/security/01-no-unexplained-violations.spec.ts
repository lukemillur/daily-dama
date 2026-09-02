import { test, expect, type Page } from "@playwright/test";

// T162.1/T162.2: proves the enforced CSP in vercel.json does not fire unexplained
// securitypolicyviolation events across the Auth and core app routes. Playwright has
// no built-in CSP API, so this registers a DOM listener via addInitScript and forwards
// each violation back to the Node test through an exposed function.
//
// Under enforcement (as of T162.2), a violation here also means broken functionality
// on that route, not just a console warning -- raises the stakes for whoever debugs a
// red run here later.

const AUTH_ROUTES = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/check-email",
  "/auth/callback",
];

const CORE_APP_ROUTES = [
  "/app/home",
  "/app/tricks",
  "/app/tricks/laced",
  "/app/sesh",
  "/app/stats",
  "/app/stats/trick-viz-sandbox",
  "/app/stats/sesh-sequence-sandbox",
  "/app/profile",
];

const ONBOARDED_PROFILE_DOCUMENT = JSON.stringify({
  version: 1,
  profile: { selectedTrickIds: [], hasCompletedOnboarding: true, kenteiRank: 5 },
});

async function seedOnboardedProfile(page: Page): Promise<void> {
  await page.addInitScript((document) => {
    window.localStorage.setItem("daily-dama:user-profile", document);
  }, ONBOARDED_PROFILE_DOCUMENT);
}

interface Violation {
  readonly violatedDirective: string;
  readonly blockedURI: string;
  readonly disposition: string;
}

async function collectViolations(page: Page): Promise<Violation[]> {
  const violations: Violation[] = [];
  await page.exposeFunction("__reportCspViolation", (violation: Violation) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportCspViolation: (violation: unknown) => void }).__reportCspViolation({
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition,
      });
    });
  });
  return violations;
}

async function assertNoViolations(page: Page, route: string): Promise<void> {
  const violations = await collectViolations(page);
  await seedOnboardedProfile(page);
  await page.goto(route, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  expect(violations, `unexplained CSP violations on ${route}: ${JSON.stringify(violations)}`).toEqual([]);
}

test.describe("enforced CSP: Auth routes have no unexplained violations", () => {
  for (const route of AUTH_ROUTES) {
    test(route, async ({ page }) => {
      await assertNoViolations(page, route);
    });
  }
});

test.describe("enforced CSP: core app routes have no unexplained violations", () => {
  for (const route of CORE_APP_ROUTES) {
    test(route, async ({ page }) => {
      await assertNoViolations(page, route);
    });
  }
});
