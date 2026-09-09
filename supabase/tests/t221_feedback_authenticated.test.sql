-- T221: signed-in users reach api.feedback as role `authenticated` (the
-- shared Supabase client attaches the session JWT once one exists), not
-- `anon`. T217.1 only granted/policied `anon`, so every real logged-in
-- submission failed with 42501 "permission denied for table feedback" in
-- production. Prove `authenticated` now has the same narrow INSERT-only
-- capability as `anon`, gated by the same WITH CHECK bounds, with no
-- broader access.

-- T258: email moved to a server-owned BEFORE INSERT trigger; the
-- "malformed email rejected" case here is now covered by
-- t258_feedback_server_owned_email.test.sql instead (the trigger forces
-- email to null/JWT-derived before RLS WITH CHECK ever sees client input).

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- =====================================================================
-- Well-formed authenticated insert succeeds.
-- =====================================================================

set local role authenticated;

select lives_ok(
  $$ insert into api.feedback (name, message)
     values ('Signed In User', 'Also loving the app!') $$,
  'authenticated can insert a well-formed feedback row'
);

reset role;

select is(
  (select count(*)::int from api.feedback where message = 'Also loving the app!'), 1,
  'the well-formed authenticated insert actually persisted (unrestricted context can see it)'
);

-- =====================================================================
-- Malformed authenticated inserts are rejected (either enforcement layer
-- -- table CHECK or RLS WITH CHECK -- is an acceptable failure).
-- =====================================================================

set local role authenticated;

select throws_ok(
  $$ insert into api.feedback (message) values ('') $$,
  null, null, 'authenticated insert with empty message is rejected'
);

select throws_ok(
  $$ insert into api.feedback (message) values (repeat('x', 2001)) $$,
  null, null, 'authenticated insert with message over 2000 chars is rejected'
);

reset role;

-- =====================================================================
-- authenticated still has no SELECT/UPDATE/DELETE privilege on
-- api.feedback -- the new grant is INSERT-only, matching anon.
-- =====================================================================

set local role authenticated;

select throws_ok(
  $$ select 1 from api.feedback limit 1 $$,
  '42501', null, 'authenticated cannot SELECT api.feedback (no grant at all)'
);

select throws_ok(
  $$ update api.feedback set message = 'edited' where message = 'Also loving the app!' $$,
  '42501', null, 'authenticated cannot UPDATE api.feedback (no grant at all)'
);

select throws_ok(
  $$ delete from api.feedback where message = 'Also loving the app!' $$,
  '42501', null, 'authenticated cannot DELETE api.feedback (no grant at all)'
);

reset role;

select * from finish();
rollback;
