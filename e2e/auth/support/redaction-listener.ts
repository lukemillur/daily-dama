import type { Page } from '@playwright/test';

/**
 * T153.13 06-redaction.spec.ts's shared boundary check. Attaches a console listener and
 * intercepts the Vercel Analytics collection request on the given page, accumulating
 * every observed string so a spec can assert no raw email/password/token ever leaked.
 */
export class RedactionListener {
  private readonly observed: string[] = [];

  constructor(page: Page) {
    page.on('console', (message) => {
      this.observed.push(message.text());
    });
    page.on('request', (request) => {
      if (request.url().includes('vitals.vercel-insights.com')) {
        this.observed.push(request.url());
        const body = request.postData();
        if (body) this.observed.push(body);
      }
    });
  }

  /** Asserts none of the given raw substrings ever appeared in any observed string. */
  assertNeverContains(...secrets: string[]): void {
    for (const secret of secrets) {
      const leaked = this.observed.find((text) => text.includes(secret));
      if (leaked !== undefined) {
        throw new Error(
          'Redaction boundary leaked a raw secret substring "' + secret + '" in: ' + leaked,
        );
      }
    }
  }
}
