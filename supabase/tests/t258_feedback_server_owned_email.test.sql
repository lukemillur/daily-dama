-- T258: api.feedback.email is now fully server-owned via a BEFORE INSERT
-- trigger (private.enforce_feedback_mutation_invariants, added by
-- 20260909000000_enforce_feedback_email_server_owned.sql). The client no
-- longer sends an email at all, but this proves the server-side contract
-- directly: an anonymous insert always gets a null email regardless of what
-- (if anything) is supplied, and an authenticated insert always gets the
-- caller's own JWT-derived email, even when the insert attempts to spoof a
-- different value.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- =====================================================================
-- anon: email is always forced null.
-- =====================================================================

set local role anon;

select lives_ok(
  $$ insert into api.feedback (message) values ('t258 anon no email') $$,
  'anon can insert with no email supplied'
);

select lives_ok(
  $$ insert into api.feedback (email, message)
     values ('spoofed@example.com', 't258 anon spoofed email') $$,
  'anon insert with a supplied email still succeeds (the trigger overrides it, RLS does not reject it)'
);

reset role;

select is(
  (select email from api.feedback where message = 't258 anon no email'),
  null,
  'anon insert with no email supplied persists a null email'
);

select is(
  (select email from api.feedback where message = 't258 anon spoofed email'),
  null,
  'anon insert with a supplied email persists null anyway (server-owned, not client-supplied)'
);

-- =====================================================================
-- authenticated: email is always forced to the JWT's own email claim, even
-- when the insert attempts to set a different, spoofed value.
-- =====================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-0000000002ff',
    'role', 'authenticated',
    'email', 'realuser@example.com'
  )::text,
  true
);

select lives_ok(
  $$ insert into api.feedback (email, message)
     values ('spoofed@evil.example.com', 't258 authenticated spoofed email') $$,
  'authenticated insert with a spoofed email succeeds (the trigger overrides it)'
);

reset role;

select is(
  (select email from api.feedback where message = 't258 authenticated spoofed email'),
  'realuser@example.com',
  'authenticated insert with a spoofed email persists the JWT''s own email, not the spoofed value'
);

select * from finish();
rollback;
