begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- Fixture auth users.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000001a'),
  ('00000000-0000-0000-0000-00000000001b'),
  ('00000000-0000-0000-0000-00000000001c'),
  ('00000000-0000-0000-0000-00000000001d');

-- 1-2: valid goal variants.
select lives_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-1', 'lighthouse', 'Lighthouse', 'count', 50) $$,
  'a minimal count goal is valid'
);

select lives_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_ms)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-2', 'big-cup', 'Big cup', 'time', 600000) $$,
  'a minimal time goal is valid (10 minutes)'
);

-- 3-9: malformed/ambiguous goal shapes.
select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-1', 'lighthouse', 'Lighthouse', 'bogus', 50) $$,
  '23514', null, 'an unknown goal kind is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count, target_ms)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-2', 'lighthouse', 'Lighthouse', 'count', 50, 600000) $$,
  '23514', null, 'a count goal that also carries target_ms (ambiguous variant) is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_ms, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-3', 'lighthouse', 'Lighthouse', 'time', 600000, 50) $$,
  '23514', null, 'a time goal that also carries target_count (ambiguous variant) is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-4', 'lighthouse', 'Lighthouse', 'count', 0) $$,
  '23514', null, 'a count goal target_count below the minimum is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-5', 'lighthouse', 'Lighthouse', 'count', 100001) $$,
  '23514', null, 'a count goal target_count above the maximum is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_ms)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-6', 'lighthouse', 'Lighthouse', 'time', 90000) $$,
  '23514', null, 'a time goal target_ms that is not a whole-minute multiple is rejected'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-bad-7', 'lighthouse', '   ', 'count', 50) $$,
  '23514', null, 'a blank/untrimmed trick_name is rejected'
);

-- 10: duplicate (user, id) is rejected.
select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-1', 'lighthouse', 'Lighthouse', 'count', 1) $$,
  '23505', null, 'a duplicate goal id for the same user is rejected'
);

-- 11-12: server-owned insert fields, ignoring client-supplied overrides.
select lives_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count, revision, deleted_at)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-3', 'lighthouse', 'Lighthouse', 'count', 10, 99, now()) $$,
  'inserting a goal with a client-supplied revision/deleted_at succeeds (both are ignored, not rejected)'
);

select is(
  (select (revision, deleted_at is null) from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  (1, true),
  'the server ignores client-supplied revision/deleted_at on insert: revision always starts at 1 and the row is always live'
);

-- 14-16: revision increments through a valid edit.
select lives_ok(
  $$ update api.goals set target_count = 25
     where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3' $$,
  'editing a live goal succeeds'
);

select is(
  (select target_count from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  25,
  'the edit is applied'
);

select is(
  (select revision from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  2,
  'a valid edit increments the revision'
);

-- 17-20: tombstoning, then stale-mutation resurrection is rejected.
select lives_ok(
  $$ update api.goals set deleted_at = now()
     where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3' $$,
  'tombstoning a live goal succeeds'
);

select is(
  (select revision from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  3,
  'tombstoning also increments the revision'
);

select throws_ok(
  $$ update api.goals set deleted_at = null
     where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3' and revision = 3 $$,
  '23514', null, 'a stale mutation matching the current identity/revision cannot undelete a tombstoned goal'
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001a', 'goal-3', 'lighthouse', 'Lighthouse', 'count', 1)
     on conflict (user_id, id) do update set target_count = excluded.target_count $$,
  '23514', null, 'an upsert-style stale mutation cannot silently recreate a tombstoned goal via ON CONFLICT DO UPDATE'
);

select is(
  (select target_count from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  25,
  'the tombstoned goal target_count is unchanged after both rejected resurrection attempts'
);

select ok(
  (select deleted_at is not null from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  'the tombstoned goal is still tombstoned after both rejected resurrection attempts'
);

select is(
  (select revision from api.goals where user_id = '00000000-0000-0000-0000-00000000001a' and id = 'goal-3'),
  3,
  'the tombstoned goal revision is unchanged after both rejected resurrection attempts'
);

-- 21: cascade deletion.
delete from auth.users where id = '00000000-0000-0000-0000-00000000001a';

select is(
  (select count(*)::int from api.goals where user_id = '00000000-0000-0000-0000-00000000001a'), 0,
  'deleting the auth user cascades to delete its goal rows'
);

-- 22-25: notes -- valid variants, including a real session association.
insert into api.practice_sessions (
  user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
) values (
  '00000000-0000-0000-0000-00000000001b', 'sesh-1', 'lighthouse', 'Lighthouse', 1000000, 1030000, 30000, 12
);

select lives_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body)
     values ('00000000-0000-0000-0000-00000000001b', 'note-1', 'lighthouse', 'Lighthouse', 'Landed it clean today.') $$,
  'a minimal note without a session association is valid'
);

select lives_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body, practice_session_id)
     values ('00000000-0000-0000-0000-00000000001b', 'note-2', 'lighthouse', 'Lighthouse', 'Great sesh.', 'sesh-1') $$,
  'a note referencing the same user''s own practice session is valid'
);

select throws_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body, practice_session_id)
     values ('00000000-0000-0000-0000-00000000001b', 'note-bad-1', 'lighthouse', 'Lighthouse', 'Bad ref', 'no-such-session') $$,
  '23503', null, 'a note referencing a nonexistent practice session is rejected'
);

insert into api.practice_sessions (
  user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
) values (
  '00000000-0000-0000-0000-00000000001c', 'sesh-foreign', 'lighthouse', 'Lighthouse', 1000000, 1030000, 30000, 12
);

select throws_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body, practice_session_id)
     values ('00000000-0000-0000-0000-00000000001b', 'note-bad-2', 'lighthouse', 'Lighthouse', 'Cross-user ref', 'sesh-foreign') $$,
  '23503', null, 'a note cannot reference another user''s practice session even if the session id exists'
);

-- 26-27: other malformed note shapes.
select throws_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body)
     values ('00000000-0000-0000-0000-00000000001b', 'note-bad-3', 'lighthouse', 'Lighthouse', '   ') $$,
  '23514', null, 'a blank/untrimmed body is rejected'
);

select throws_ok(
  $$ insert into api.notes (user_id, id, trick_id, trick_name, body)
     values ('00000000-0000-0000-0000-00000000001b', 'note-1', 'lighthouse', 'Lighthouse', 'Duplicate id') $$,
  '23505', null, 'a duplicate note id for the same user is rejected'
);

-- 28-30: revision increments through a valid edit.
select lives_ok(
  $$ update api.notes set body = 'Revised note body.'
     where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1' $$,
  'editing a live note succeeds'
);

select is(
  (select body from api.notes where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1'),
  'Revised note body.',
  'the note edit is applied'
);

select is(
  (select revision from api.notes where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1'),
  2,
  'a valid note edit increments the revision'
);

-- 31-34: tombstoning, then stale-mutation resurrection is rejected.
select lives_ok(
  $$ update api.notes set deleted_at = now()
     where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1' $$,
  'tombstoning a live note succeeds'
);

select throws_ok(
  $$ update api.notes set deleted_at = null
     where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1' and revision = 3 $$,
  '23514', null, 'a stale mutation matching the current identity/revision cannot undelete a tombstoned note'
);

select throws_ok(
  $$ update api.notes set body = 'sneaky resurrection attempt'
     where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1' $$,
  '23514', null, 'any further edit of a tombstoned note (not just clearing deleted_at) is rejected'
);

select is(
  (select body from api.notes where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1'),
  'Revised note body.',
  'the tombstoned note body is unchanged after both rejected mutation attempts'
);

select ok(
  (select deleted_at is not null from api.notes where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1'),
  'the tombstoned note is still tombstoned after both rejected mutation attempts'
);

select is(
  (select revision from api.notes where user_id = '00000000-0000-0000-0000-00000000001b' and id = 'note-1'),
  3,
  'the tombstoned note revision is unchanged after both rejected mutation attempts'
);

-- 35: cascade deletion.
delete from auth.users where id = '00000000-0000-0000-0000-00000000001b';

select is(
  (select count(*)::int from api.notes where user_id = '00000000-0000-0000-0000-00000000001b'), 0,
  'deleting the auth user cascades to delete its note rows'
);

-- 36-39: ownership isolation and the no-hard-delete grant, for an
-- authenticated client.
insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
values
  ('00000000-0000-0000-0000-00000000001c', 'goal-owned', 'lighthouse', 'Lighthouse', 'count', 10),
  ('00000000-0000-0000-0000-00000000001d', 'goal-foreign', 'lighthouse', 'Lighthouse', 'count', 10);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000001c', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ insert into api.goals (user_id, id, trick_id, trick_name, kind, target_count)
     values ('00000000-0000-0000-0000-00000000001d', 'goal-other', 'lighthouse', 'Lighthouse', 'count', 10) $$,
  '42501', null, 'an authenticated client cannot insert a goal for another user_id'
);

-- RLS's USING clause silently excludes non-owned rows from an UPDATE's
-- target set rather than raising, so a cross-user update attempt succeeds
-- as a statement but affects zero rows; verify isolation by reading the
-- foreign row back afterward (still requires resetting role, since this
-- session's RLS also hides it from the attacker's own SELECT).
select lives_ok(
  $$ update api.goals set target_count = 999
     where user_id = '00000000-0000-0000-0000-00000000001d' and id = 'goal-foreign' $$,
  'an authenticated client''s update statement targeting another user''s goal does not raise (RLS silently matches zero rows)'
);

select throws_ok(
  $$ delete from api.goals
     where user_id = '00000000-0000-0000-0000-00000000001c' and id = 'goal-owned' $$,
  '42501', null, 'an authenticated client cannot hard-delete its own goal: no DELETE privilege is granted at all'
);

reset role;

select is(
  (select target_count from api.goals where user_id = '00000000-0000-0000-0000-00000000001d' and id = 'goal-foreign'),
  10,
  'the foreign goal is unchanged: RLS isolated it from the cross-user update attempt above'
);

select * from finish();
rollback;
