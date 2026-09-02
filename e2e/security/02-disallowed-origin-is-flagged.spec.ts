import { test, expect, type Page } from "@playwright/test";

// T162.1/T162.2: positive control. Proves the enforced CSP header is genuinely active
// end to end -- a definitely-unlisted origin fetch is flagged with a connect-src
// violation, with disposition "enforce" -- not just present as inert response-header
// text nobody is listening to, and not merely still logging as report-only would.

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

test("a definitely-unlisted origin fetch is flagged as a connect-src violation", async ({ page }) => {
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
  await seedOnboardedProfile(page);

  await page.goto("/app/home", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    return fetch("https://example.com/csp-test").catch(() => undefined);
  });
  await page.waitForTimeout(300);

  const connectSrcViolations = violations.filter((violation) =>
    violation.violatedDirective.startsWith("connect-src"),
  );
  expect(connectSrcViolations.length).toBeGreaterThan(0);
  for (const violation of connectSrcViolations) {
    expect(violation.disposition).toBe("enforce");
  }
});
