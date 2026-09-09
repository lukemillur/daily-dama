// T217.2/T221/T258: submits a feedback row directly to `api.feedback` using
// the shared, session-persisting Supabase client (see
// src/shared/supabase/supabase-client.ts). No server route or
// service-role key is involved. Because that client has
// `persistSession: true`, it attaches the caller's own JWT once a session
// exists, so this call reaches PostgREST as `anon` for signed-out visitors
// and as `authenticated` for signed-in ones -- both roles need their own
// INSERT grant and WITH CHECK policy (T217.1 for anon, T221's migration for
// authenticated) for this call to succeed either way. `email` is not part
// of this submission at all: a server-owned BEFORE INSERT trigger
// (20260909000000_enforce_feedback_email_server_owned.sql) derives it from
// the caller's own JWT when signed in, and forces it null otherwise --
// never from client input.

import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import { mapNetworkError, mapPostgrestError, type CloudMutationResult } from '@/shared/supabase/cloud-repository';

export interface FeedbackSubmission {
  readonly name?: string;
  readonly message: string;
}

/**
 * Trims and blanks-to-undefined the optional name, matching the table's own
 * "empty optional text is stored as NULL, not an empty string" shape -- an
 * all-whitespace name shouldn't be persisted as if it were a real one.
 */
function normalize(submission: FeedbackSubmission): {
  name: string | null;
  message: string;
} {
  const name = submission.name?.trim();
  return {
    name: name ? name : null,
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
