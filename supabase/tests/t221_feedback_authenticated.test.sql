-- T221: signed-in users reach api.feedback as role `authenticated` (the
-- shared Supabase client attaches the session JWT once one exists), not
-- `anon`. T217.1 only granted/policied `anon`, so every real logged-in
-- submission failed with 42501 "permission denied for table feedback" in
-- production. Prove `authenticated` now has the same narrow INSERT-only
-- capability as `anon`, gated by the same WITH CHECK bounds, with no
-- broader access.

begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- =====================================================================
-- Well-formed authenticated insert succeeds.
-- =====================================================================

set local role authenticated;

select lives_ok(
  $$ insert into api.feedback (name, email, message)
     values ('Signed In User', 'signedin@example.com', 'Also loving the app!') $$,
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

select throws_ok(
  $$ insert into api.feedback (email, message) values ('not-an-email', 'hi') $$,
  null, null, 'authenticated insert with malformed email is rejected'
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
