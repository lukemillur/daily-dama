-- T217.1: api.feedback is a narrow, deliberate exception to "anon gets
-- nothing here or anywhere else" (see the new migration's header comment).
-- Prove anon can insert well-formed rows, anon insert is rejected by both
-- enforcement layers (table CHECK and RLS WITH CHECK) for malformed input,
-- anon has no SELECT/UPDATE/DELETE privilege at all on this table, and an
-- unrestricted (service-role-equivalent) context can read an anon-inserted
-- row back -- i.e. it actually persisted.

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- =====================================================================
-- Well-formed anon insert succeeds.
-- =====================================================================

set local role anon;

select lives_ok(
  $$ insert into api.feedback (name, email, message)
     values ('Test User', 'test@example.com', 'Loving the app!') $$,
  'anon can insert a well-formed feedback row'
);

select lives_ok(
  $$ insert into api.feedback (message) values ('no name or email needed') $$,
  'anon can insert with name/email both null'
);

reset role;

select is(
  (select count(*)::int from api.feedback where message = 'Loving the app!'), 1,
  'the well-formed anon insert actually persisted (unrestricted context can see it)'
);

-- =====================================================================
-- Malformed/oversized anon inserts are rejected (either enforcement
-- layer -- table CHECK or RLS WITH CHECK -- is an acceptable failure).
-- =====================================================================

set local role anon;

select throws_ok(
  $$ insert into api.feedback (message) values ('') $$,
  null, null, 'anon insert with empty message is rejected'
);

select throws_ok(
  $$ insert into api.feedback (message) values ('   ') $$,
  null, null, 'anon insert with whitespace-only message is rejected'
);

select throws_ok(
  $$ insert into api.feedback (message) values (repeat('x', 2001)) $$,
  null, null, 'anon insert with message over 2000 chars is rejected'
);

select throws_ok(
  $$ insert into api.feedback (name, message) values (repeat('x', 101), 'hi') $$,
  null, null, 'anon insert with name over 100 chars is rejected'
);

select throws_ok(
  $$ insert into api.feedback (email, message) values ('not-an-email', 'hi') $$,
  null, null, 'anon insert with malformed email is rejected'
);

reset role;

-- =====================================================================
-- anon has no SELECT/UPDATE/DELETE privilege on api.feedback at all.
-- =====================================================================

set local role anon;

select throws_ok(
  $$ select 1 from api.feedback limit 1 $$,
  '42501', null, 'anon cannot SELECT api.feedback (no grant at all)'
);

select throws_ok(
  $$ update api.feedback set message = 'edited' where message = 'Loving the app!' $$,
  '42501', null, 'anon cannot UPDATE api.feedback (no grant at all)'
);

select throws_ok(
  $$ delete from api.feedback where message = 'Loving the app!' $$,
  '42501', null, 'anon cannot DELETE api.feedback (no grant at all)'
);

reset role;

select * from finish();
rollback;
