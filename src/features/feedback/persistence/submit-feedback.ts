// T217.2: submits a feedback row directly to `api.feedback` using the
// browser-persistent anon-key Supabase client (see
// src/shared/supabase/supabase-client.ts). No server route or
// service-role key is involved -- T217.1's RLS grant (anon INSERT-only,
// with the same length/format bounds re-enforced in its WITH CHECK) is
// the entire authorization surface for this call, matching how
// unauthenticated visitors and signed-in users both submit through the
// exact same path.

import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import { mapNetworkError, mapPostgrestError, type CloudMutationResult } from '@/shared/supabase/cloud-repository';

export interface FeedbackSubmission {
  readonly name?: string;
  readonly email?: string;
  readonly message: string;
}

/**
 * Trims and blanks-to-undefined the optional fields, matching the table's
 * own "empty optional text is stored as NULL, not an empty string" shape --
 * an all-whitespace name/email shouldn't be persisted as if it were real
 * volunteered contact info.
 */
function normalize(submission: FeedbackSubmission): {
  name: string | null;
  email: string | null;
  message: string;
} {
  const name = submission.name?.trim();
  const email = submission.email?.trim();
  return {
    name: name ? name : null,
    email: email ? email : null,
    message: submission.message.trim(),
  };
}

export async function submitFeedback(submission: FeedbackSubmission): Promise<CloudMutationResult<void>> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      status: 'failed',
      error: { kind: 'unknown', message: 'Feedback submission is unavailable right now.' },
    };
  }

  try {
    const { error } = await client.from('feedback').insert(normalize(submission));
    if (error) return { status: 'failed', error: mapPostgrestError(error) };
    return { status: 'succeeded', value: undefined };
  } catch (cause) {
    return { status: 'failed', error: mapNetworkError(cause) };
  }
}
