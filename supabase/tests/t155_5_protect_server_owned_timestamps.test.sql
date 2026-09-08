begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Fixture auth users.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000002a'),
  ('00000000-0000-0000-0000-00000000002b');

-- === 1-6: trigger-level forced ownership on api.profiles (run as the
-- unrestricted test-session role, so a client-side column grant can never
-- explain a passing assertion here -- only the trigger can). ===
select lives_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding, revision, created_at, updated_at)
     values ('00000000-0000-0000-0000-00000000002a', false, 99, '2000-01-01', '2000-01-01') $$,
  'inserting a profile with a client-supplied revision/created_at/updated_at succeeds (all three are ignored)'
);

select is(
  (select (revision, created_at > '2000-01-02'::timestamptz, updated_at > '2000-01-02'::timestamptz)
   from api.profiles where user_id = '00000000-0000-0000-0000-00000000002a'),
  (1, true, true),
  'the server ignores the client-supplied revision/created_at/updated_at on insert'
);

select lives_ok(
  $$ update api.profiles
     set has_completed_onboarding = true, kentei_rank = 3,
         user_id = '00000000-0000-0000-0000-00000000002b',
         revision = 999, created_at = '2000-01-01'
     where user_id = '00000000-0000-0000-0000-00000000002a' $$,
  'updating a profile with forged user_id/revision/created_at succeeds (all three are ignored, not the legitimate edit)'
);

select is(
  (select user_id from api.profiles where user_id = '00000000-0000-0000-0000-00000000002a'),
  '00000000-0000-0000-0000-00000000002a',
  'the server pins user_id to its existing value: an update cannot repoint a profile to another account'
);

select is(
  (select revision from api.profiles where user_id = '00000000-0000-0000-0000-00000000002a'),
  2,
  'the server ignores the forged revision and always advances by exactly one'
);

select ok(
  (select created_at < updated_at - interval '1 day' is not true
   from api.profiles where user_id = '00000000-0000-0000-0000-00000000002a'),
  'the server ignores the forged created_at: it stays pinned to the original insert time, not the far-past forged value'
);

-- === 7-12: trigger-level forced ownership on api.user_trick_states,
-- including the identity columns (id, user_id, trick_id). ===
select lives_ok(
  $$ insert into api.user_trick_states (id, user_id, trick_id, is_selected, revision, created_at, updated_at)
     values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000002a', 'lighthouse', true, 99, '2000-01-01', '2000-01-01') $$,
  'inserting a trick-state row with a client-supplied id/revision/created_at/updated_at succeeds (all four are ignored)'
);

select isnt(
  (select id from api.user_trick_states where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse'),
  '11111111-1111-1111-1111-111111111111',
  'the server ignores the client-supplied id and generates its own'
);

select is(
  (select revision from api.user_trick_states where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse'),
  1,
  'the server ignores the client-supplied revision on insert'
);

select lives_ok(
  $$ update api.user_trick_states
     set is_manually_unlocked = true, trick_id = 'other-trick', revision = 999
     where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse' $$,
  'updating a trick-state row with a forged trick_id/revision succeeds (both are ignored, the legitimate flag edit is applied)'
);

select is(
  (select trick_id from api.user_trick_states where user_id = '00000000-0000-0000-0000-00000000002a' and is_manually_unlocked),
  'lighthouse',
  'the server pins trick_id: an update cannot retarget an existing row onto a different trick'
);

select is(
  (select revision from api.user_trick_states where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse'),
  2,
  'the server ignores the forged revision and always advances by exactly one'
);

-- === 13-18: trigger-level forced ownership on api.custom_tricks, including
-- kind (pinned: no local editing flow converts standalone <-> sequence). ===
select lives_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, revision, created_at, updated_at)
     values ('00000000-0000-0000-0000-00000000002a', 'trick-1', 'standalone', 'My trick', 99, '2000-01-01', '2000-01-01') $$,
  'inserting a custom trick with a client-supplied revision/created_at/updated_at succeeds (all three are ignored)'
);

select is(
  (select revision from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1'),
  1,
  'the server ignores the client-supplied revision on insert'
);

select lives_ok(
  $$ update api.custom_tricks
     set name = 'Renamed trick', kind = 'sequence', revision = 999
     where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1' $$,
  'updating a custom trick with a forged kind/revision succeeds (both are ignored, the legitimate rename is applied)'
);

select is(
  (select kind from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1'),
  'standalone',
  'the server pins kind: an update cannot convert an existing custom trick between standalone and sequence'
);

select is(
  (select name from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1'),
  'Renamed trick',
  'the legitimate name edit is applied alongside the ignored kind/revision forgeries'
);

select is(
  (select revision from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1'),
  2,
  'the server ignores the forged revision and always advances by exactly one'
);

-- === 19-20: trigger-level forced receipt timestamp on api.practice_sessions. ===
select lives_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count, created_at
     ) values (
       '00000000-0000-0000-0000-00000000002a', 'sesh-1', 'lighthouse', 'Lighthouse', 1000000, 1030000, 30000, 12, '2000-01-01'
     ) $$,
  'inserting a practice session with a client-supplied created_at succeeds (the forged receipt timestamp is ignored)'
);

select ok(
  (select created_at > '2000-01-02'::timestamptz from api.practice_sessions where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'sesh-1'),
  'the server ignores the forged created_at and stamps its own receipt time'
);

-- === 21-26: search_path is fixed on every trigger function this migration
-- owns or amends. ===
select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_custom_trick_step_invariants'),
  'search_path=""',
  'enforce_custom_trick_step_invariants (T155.3) has an explicit empty search_path'
);

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_goal_note_mutation_invariants'),
  'search_path=""',
  'enforce_goal_note_mutation_invariants (T155.4) has an explicit empty search_path'
);

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_profile_mutation_invariants'),
  'search_path=""',
  'enforce_profile_mutation_invariants has an explicit empty search_path'
);

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_user_trick_state_mutation_invariants'),
  'search_path=""',
  'enforce_user_trick_state_mutation_invariants has an explicit empty search_path'
);

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_custom_trick_mutation_invariants'),
  'search_path=""',
  'enforce_custom_trick_mutation_invariants has an explicit empty search_path'
);

select is(
  (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_practice_session_receipt_timestamp'),
  'search_path=""',
  'enforce_practice_session_receipt_timestamp has an explicit empty search_path'
);

-- 27: no function in api/private is SECURITY DEFINER today, so the "every
-- SECURITY DEFINER function has an audited fixed search_path" exit
-- criterion holds vacuously; this pins that fact so a future SECURITY
-- DEFINER function is forced to be a deliberate, reviewed addition.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'private') and p.prosecdef),
  0,
  'no function in api or private is SECURITY DEFINER'
);

-- === 28-38: column-level grants reject a forged/out-of-scope value outright
-- (42501) for an authenticated client, independent of the trigger and of
-- RLS row-scoping -- this is the "RLS is not the only protection" half of
-- the exit criteria. ===
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000002a', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ update api.profiles set revision = 5 where user_id = '00000000-0000-0000-0000-00000000002a' $$,
  '42501', null, 'an authenticated client cannot target revision in a profiles UPDATE at all (no column privilege, regardless of RLS)'
);

select throws_ok(
  $$ update api.profiles set created_at = now() where user_id = '00000000-0000-0000-0000-00000000002a' $$,
  '42501', null, 'an authenticated client cannot target created_at in a profiles UPDATE at all'
);

select lives_ok(
  $$ update api.profiles set has_completed_onboarding = true where user_id = '00000000-0000-0000-0000-00000000002a' $$,
  'an authenticated client can still update its own mutable profile columns'
);

select throws_ok(
  $$ update api.user_trick_states set trick_id = 'other-trick' where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse' $$,
  '42501', null, 'an authenticated client cannot target trick_id in a user_trick_states UPDATE at all'
);

select throws_ok(
  $$ update api.user_trick_states set revision = 5 where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse' $$,
  '42501', null, 'an authenticated client cannot target revision in a user_trick_states UPDATE at all'
);

select lives_ok(
  $$ update api.user_trick_states set is_selected = false where user_id = '00000000-0000-0000-0000-00000000002a' and trick_id = 'lighthouse' $$,
  'an authenticated client can still update its own mutable trick-state columns'
);

select throws_ok(
  $$ update api.custom_tricks set kind = 'sequence' where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1' $$,
  '42501', null, 'an authenticated client cannot target kind in a custom_tricks UPDATE at all'
);

select lives_ok(
  $$ update api.custom_tricks set name = 'Renamed again' where user_id = '00000000-0000-0000-0000-00000000002a' and id = 'trick-1' $$,
  'an authenticated client can still update its own mutable custom-trick columns'
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count, created_at
     ) values (
       '00000000-0000-0000-0000-00000000002a', 'sesh-2', 'lighthouse', 'Lighthouse', 1000000, 1030000, 30000, 12, now()
     ) $$,
  '42501', null, 'an authenticated client cannot target created_at in a practice_sessions INSERT at all'
);

select lives_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000002a', 'sesh-3', 'lighthouse', 'Lighthouse', 1000000, 1030000, 30000, 12
     ) $$,
  'an authenticated client can still insert a practice session without targeting created_at'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count, revision)
     values ('00000000-0000-0000-0000-00000000002a', 'goal-1', 'lighthouse', 'Lighthouse', 'count', 10, 5) $$,
  '42501', null, 'an authenticated client cannot target revision in a goals INSERT at all'
);

reset role;

select * from finish();
rollback;
