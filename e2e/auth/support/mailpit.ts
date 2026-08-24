const MAILPIT_URL = 'http://127.0.0.1:54324';

interface MailpitMessageSummary {
  readonly ID: string;
  readonly To: ReadonlyArray<{ readonly Address: string }>;
}

interface MailpitMessageDetail {
  readonly Text?: string;
  readonly HTML?: string;
}

/**
 * Fetches Mailpit's JSON API directly (instead of driving its web UI in a second
 * browser context) and pulls the auth/v1/verify link out of the most recent message
 * sent to the given address. Polls briefly since local SMTP delivery is async.
 */
export async function fetchLatestAuthLink(address: string): Promise<string | null> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listRes = await fetch(MAILPIT_URL + '/api/v1/messages?limit=10');
    const listJson = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    const match = listJson.messages.find((message) =>
      message.To.some((recipient) => recipient.Address === address),
    );
    if (match) {
      const detailRes = await fetch(MAILPIT_URL + '/api/v1/message/' + match.ID);
      const detail = (await detailRes.json()) as MailpitMessageDetail;
      const body = detail.Text || detail.HTML || '';
      const verifyPattern = new RegExp(
        'https?://[^\\s"' + "'" + '<>]+auth/v1/verify[^\\s"' + "'" + '<>]*',
      );
      const found = body.match(verifyPattern);
      if (found) return found[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}
