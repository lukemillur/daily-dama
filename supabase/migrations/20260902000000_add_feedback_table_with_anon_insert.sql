-- Add api.feedback (T217.1): a narrow, deliberate exception to the "anon
-- gets nothing here or anywhere else" policy stated in
-- 20260822191737_create_private_and_exposed_schemas.sql's step 5. That
-- comment is now stale: this migration grants `anon` USAGE on schema `api`
-- and INSERT-only access to exactly one table, so users can submit feedback
-- without an account. No other anon grant exists anywhere else in the
-- schema; anon still cannot SELECT/UPDATE/DELETE this table or reach any
-- other table or schema. See TASKS.md T217/T217.1 for why this table exists
-- (Resend inbound email was rejected during scoping -- shared send-quota
-- risk with Auth transactional email) and why anon-insert was chosen over
-- server-side/service-role insertion (would bypass RLS entirely for that
-- connection, a larger blast radius for an app-code bug than an
-- RLS-scoped anon grant, for no real increase in anonymous capability).

-- 1. Table. No user_id/ownership column at all -- feedback is intentionally
--    anonymous-or-not (name/email are free-text, optional, unverified
--    contact info the submitter volunteers, not an identity).
create table api.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text,
  message text not null,

  -- Table-level CHECK constraints are the durable enforcement layer: they
  -- hold regardless of which role writes (including service_role, which
  -- bypasses RLS) and regardless of future grant/policy changes. The RLS
  -- policy below intentionally repeats the same bounds in its WITH CHECK,
  -- which is what actually gates `anon` specifically.
  constraint feedback_message_not_blank check (length(btrim(message)) > 0),
  constraint feedback_message_length check (length(message) <= 2000),
  constraint feedback_name_length check (name is null or length(name) <= 100),
  constraint feedback_email_length check (email is null or length(email) <= 254),
  constraint feedback_email_format check (
    email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'
  )
);

comment on table api.feedback is
  'Free-text user feedback, submitted with no account required (T217). name/email are optional, unverified, submitter-supplied contact info -- not an identity or FK. anon may INSERT only; no SELECT/UPDATE/DELETE grant exists for any non-privileged role.';

-- 2. RLS + grants. anon gets schema USAGE (new -- see file header) and
--    INSERT only on this one table. No SELECT grant means an anon INSERT's
--    default (Prefer: return=minimal) response has no representation to
--    return, which is fine and intended; granting SELECT to make
--    return=representation work would break "insert-only".
grant usage on schema api to anon;

alter table api.feedback enable row level security;

grant insert on api.feedback to anon;

create policy feedback_insert_anon on api.feedback
  for insert
  to anon
  with check (
    length(btrim(message)) > 0
    and length(message) <= 2000
    and (name is null or length(name) <= 100)
    and (email is null or length(email) <= 254)
    and (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$')
  );
