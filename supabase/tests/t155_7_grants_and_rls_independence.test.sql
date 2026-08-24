-- T155.7: prove grants and RLS block independently, on three representative
-- tables (practice_sessions: select/insert-only shape; goals: tombstoned
-- select/insert/update-no-delete shape; profiles: the DELETE-grant gap
-- closed by this same ticket's migration). The remaining three exposed
-- tables (user_trick_states, custom_tricks, notes) share the identical
-- grant/RLS mechanics already exercised for ownership at the SQL level in
-- t155_2-t155_5; re-deriving independence for all six would be repetitive
-- without adding real coverage.
--
-- Two directions per table:
--   (a) grants alone block an operation, even with RLS fully disabled (so a
--       policy that would have denied it anyway cannot be masking the real
--       cause).
--   (b) RLS alone blocks cross-user access, even with the table-level grant
--       temporarily widened beyond what this schema actually grants (so a
--       narrower grant that would have denied it anyway cannot be masking
--       the real cause).
--
-- ALTER TABLE ... {DIS,EN}ABLE ROW LEVEL SECURITY and GRANT/REVOKE are
-- transactional DDL, so the outer rollback; would undo all of this anyway --
-- everything below still restores state explicitly regardless, so this file
-- stays correct and self-documenting if anyone ever runs a block of it
-- outside the wrapping transaction.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- Fixture auth users and one owned row per table, all owned by A.
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

insert into api.profiles (user_id, has_completed_onboarding)
values ('aaaaaaaa-0000-0000-0000-000000000001', false);

insert into api.practice_sessions (
  user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'sess-1', 'trick-1', 'Trick One', 1000, 2000, 1000, 5
);

insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'goal-1', 'trick-1', 'Trick One', 'count', 10);

-- =====================================================================
-- (a) Grants alone block, even with RLS disabled.
-- =====================================================================

alter table api.practice_sessions disable row level security;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ update api.practice_sessions set lace_count = 1 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'grants alone block UPDATE on practice_sessions even with RLS disabled'
);

select throws_ok(
  $$ delete from api.practice_sessions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'grants alone block DELETE on practice_sessions even with RLS disabled'
);

reset role;
alter table api.practice_sessions enable row level security;

alter table api.goals disable row level security;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ delete from api.goals where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'grants alone block DELETE on goals even with RLS disabled'
);

reset role;
alter table api.goals enable row level security;

alter table api.profiles disable row level security;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ delete from api.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'grants alone block DELETE on profiles even with RLS disabled (regression proof of the fixed gap)'
);

reset role;
alter table api.profiles enable row level security;

-- =====================================================================
-- (b) RLS alone blocks cross-user access, even with grants maximally
--     widened beyond this schema's real grant surface.
-- =====================================================================

-- profiles: temporarily widen with the exact grant this ticket just
-- revoked, then attempt the delete as user B against A's row.
grant delete on api.profiles to authenticated;

select is(
  (select count(*)::int from api.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'sanity: A''s profile still exists before the widened-grant probe'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

delete from api.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;

select is(
  (select count(*)::int from api.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'RLS alone still protects A''s profile row even though authenticated was just granted DELETE'
);

revoke delete on api.profiles from authenticated;

-- practice_sessions: temporarily widen with a table-level UPDATE grant it
-- never actually has, then attempt the update as user B against A's row.
grant update on api.practice_sessions to authenticated;

select is(
  (select lace_count from api.practice_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'sess-1'), 5,
  'sanity: A''s practice_sessions row still has its original lace_count before the widened-grant probe'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

update api.practice_sessions set lace_count = 999
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'sess-1';

reset role;

select is(
  (select lace_count from api.practice_sessions
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and id = 'sess-1'), 5,
  'RLS alone still protects A''s practice_sessions row even though authenticated was just granted UPDATE'
);

revoke update on api.practice_sessions from authenticated;

-- goals: temporarily widen with a table-level DELETE grant it never
-- actually has, then attempt the delete as user B against A's row.
grant delete on api.goals to authenticated;

select is(
  (select count(*)::int from api.goals where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'sanity: A''s goal still exists before the widened-grant probe'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

delete from api.goals where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;

select is(
  (select count(*)::int from api.goals where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'RLS alone still protects A''s goal row even though authenticated was just granted DELETE'
);

revoke delete on api.goals from authenticated;

select * from finish();
rollback;
