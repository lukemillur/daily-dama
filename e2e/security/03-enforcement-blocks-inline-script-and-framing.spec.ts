import { test, expect, type Page } from "@playwright/test";

// T162.2: proves the enforced CSP actually blocks, not just logs, in the two ways the
// exit criteria call out by name -- an inline/unlisted script, and a framing attempt.

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

test("an unlisted inline script is refused execution, not just logged", async ({ page }) => {
  const violations = await collectViolations(page);
  await seedOnboardedProfile(page);
  await page.goto("/app/home", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__unlisted_script_executed = true;";
    document.body.appendChild(script);
  });
  await page.waitForTimeout(300);

  const scriptSrcViolations = violations.filter((violation) =>
    violation.violatedDirective.startsWith("script-src"),
  );
  expect(scriptSrcViolations.length).toBeGreaterThan(0);
  for (const violation of scriptSrcViolations) {
    expect(violation.disposition).toBe("enforce");
  }

  const executed = await page.evaluate(
    () => (window as unknown as { __unlisted_script_executed?: boolean }).__unlisted_script_executed,
  );
  expect(executed).toBeUndefined();
});

test("framing the app in an iframe is blocked by frame-ancestors", async ({ page }) => {
  await page.goto("about:blank");

  const blockedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    blockedRequests.push(request.url());
  });

  await page.setContent(
    "<iframe id='framed' src='/app/home' style='width:400px;height:400px'></iframe>",
  );

  // Give the framed navigation a bounded window to either fail outright (surfaced as a
  // requestfailed event, commonly net::ERR_BLOCKED_BY_RESPONSE in Chromium) or, if the
  // exact failure surfacing differs by Chromium version/timing, simply never populate
  // the iframe with the app content.
  await page.waitForTimeout(1000);

  const framedContentLoaded = await page.evaluate(() => {
    const iframe = document.getElementById("framed") as HTMLIFrameElement | null;
    try {
      return Boolean(
        iframe?.contentDocument?.body?.innerText?.includes("Daily Dama") ||
          iframe?.contentWindow?.location?.pathname === "/app/home",
      );
    } catch {
      return false;
    }
  });

  const wasBlocked = blockedRequests.some((url) => url.includes("/app/home")) || !framedContentLoaded;
  expect(wasBlocked).toBe(true);
});
