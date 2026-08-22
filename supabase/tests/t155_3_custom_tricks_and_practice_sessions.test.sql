begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fixture auth users.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 1-2: valid standalone custom tricks.
select lives_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-1', 'standalone', 'Lighthouse variant') $$,
  'a minimal standalone custom trick is valid'
);

select lives_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, kentei_rank)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-2', 'standalone', 'Another one', 7) $$,
  'a standalone custom trick with a kentei rank is valid'
);

-- 3-4: valid sequences.
select lives_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values (
       '00000000-0000-0000-0000-00000000000a', 'custom-seq-1', 'sequence', 'Combo one',
       '[
         {"kind":"existingTrick","sourceTrickId":"custom-1","name":"Lighthouse variant"},
         {"kind":"customText","name":"Freehand spike"}
       ]'
     ) $$,
  'a sequence referencing a standalone custom trick plus a customText step is valid'
);

select lives_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values (
       '00000000-0000-0000-0000-00000000000a', 'custom-seq-2', 'sequence', 'Combo two',
       '[
         {"kind":"existingTrick","sourceTrickId":"lighthouse","name":"Lighthouse"},
         {"kind":"existingTrick","sourceTrickId":"big-cup","name":"Big cup"}
       ]'
     ) $$,
  'a sequence referencing standard (non-custom) trick ids is valid'
);

-- 5-11: malformed/invalid custom_tricks shapes.
select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-1', 'sequence', 'Too short',
       '[{"kind":"customText","name":"Only one step"}]') $$,
  '23514', null, 'a sequence with fewer than two steps is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-2', 'standalone', 'Has steps',
       '[{"kind":"customText","name":"a"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a standalone trick with steps is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-3', 'sequence', 'Steps not array',
       '{"kind":"customText","name":"a"}') $$,
  '23514', null, 'a sequence whose steps value is not a json array is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-4', 'sequence', 'Missing name',
       '[{"kind":"customText"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a customText step missing name is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-5', 'sequence', 'Missing sourceTrickId',
       '[{"kind":"existingTrick","name":"a"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'an existingTrick step missing sourceTrickId is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-6', 'sequence', 'Unknown extra key',
       '[{"kind":"customText","name":"a","extra":true},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a step with an unknown extra key is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-7', 'sequence', 'Unknown step kind',
       '[{"kind":"bogus","name":"a"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a step with an unknown discriminant kind is rejected'
);

-- 12-14: self-reference and nested-sequence rejection (both directions).
select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-self', 'sequence', 'Self reference',
       '[{"kind":"existingTrick","sourceTrickId":"custom-self","name":"itself"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a sequence step referencing its own trick id is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, steps)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-nested-1', 'sequence', 'Nests directly',
       '[{"kind":"existingTrick","sourceTrickId":"custom-seq-1","name":"Combo one"},{"kind":"customText","name":"b"}]') $$,
  '23514', null, 'a sequence step directly referencing another sequence is rejected'
);

select throws_ok(
  $$ update api.custom_tricks
     set kind = 'sequence', steps = '[{"kind":"customText","name":"a"},{"kind":"customText","name":"b"}]'
     where user_id = '00000000-0000-0000-0000-00000000000a' and id = 'custom-1' $$,
  '23514', null, 'converting a standalone trick already referenced by another sequence into a sequence is rejected'
);

-- 15-17: other scalar-shape rejections.
select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-kind', 'bogus', 'Unknown kind') $$,
  '23514', null, 'an unknown kind value is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-name', 'standalone', '   ') $$,
  '23514', null, 'a blank/untrimmed name is rejected'
);

select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name, kentei_rank)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-bad-rank', 'standalone', 'Ranked', 13) $$,
  '23514', null, 'a kentei_rank outside 1-12 is rejected'
);

-- 18: duplicate custom trick id for the same user.
select throws_ok(
  $$ insert into api.custom_tricks (user_id, id, kind, name)
     values ('00000000-0000-0000-0000-00000000000a', 'custom-1', 'standalone', 'Duplicate id') $$,
  '23505', null, 'a duplicate custom trick id for the same user is rejected'
);

-- 19-20: cascade deletion.
select is(
  (select count(*)::int from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000000a'), 4,
  'sanity: four custom tricks exist before account deletion'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is(
  (select count(*)::int from api.custom_tricks where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'deleting the auth user cascades to delete its custom-trick rows'
);

-- 21-22: valid practice sessions.
select lives_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-1', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, 12
     ) $$,
  'a minimal open-ended practice session is valid'
);

select lives_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count,
       planned_duration_ms, origin
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-2', 'custom-1', 'Lighthouse variant',
       2000000, 2060000, 60000, 5, 60000, 'assessment'
     ) $$,
  'a fully populated timed assessment practice session is valid'
);

-- 23-27: invalid timing/count/shape variants.
select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-bad-1', 'lighthouse', 'Lighthouse',
       1000000, 999000, 0, 1
     ) $$,
  '23514', null, 'a session completed before it started is rejected'
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-bad-2', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 999, 1
     ) $$,
  '23514', null, 'a duration_ms that does not match completed_at minus started_at is rejected'
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-bad-3', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, -1
     ) $$,
  '23514', null, 'a negative lace_count is rejected'
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count,
       planned_duration_ms
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-bad-4', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, 5, 0
     ) $$,
  '23514', null, 'a planned_duration_ms of zero is rejected'
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count, origin
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-bad-5', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, 5, 'bogus'
     ) $$,
  '23514', null, 'an unknown origin value is rejected'
);

-- 28: duplicate session id for the same user.
select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000b', 'sesh-1', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, 12
     ) $$,
  '23505', null, 'a duplicate practice session id for the same user is rejected'
);

-- 29-30: cascade deletion.
select is(
  (select count(*)::int from api.practice_sessions where user_id = '00000000-0000-0000-0000-00000000000b'), 2,
  'sanity: two practice sessions exist before account deletion'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';

select is(
  (select count(*)::int from api.practice_sessions where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'deleting the auth user cascades to delete its practice-session rows'
);

-- 31-34: ownership and immutability under RLS, for an authenticated client.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d');

insert into api.practice_sessions (
  user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
) values (
  '00000000-0000-0000-0000-00000000000c', 'sesh-owned', 'lighthouse', 'Lighthouse',
  1000000, 1030000, 30000, 12
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ insert into api.practice_sessions (
       user_id, id, trick_id, trick_name, started_at, completed_at, duration_ms, lace_count
     ) values (
       '00000000-0000-0000-0000-00000000000d', 'sesh-other', 'lighthouse', 'Lighthouse',
       1000000, 1030000, 30000, 12
     ) $$,
  '42501', null, 'an authenticated client cannot insert a practice session for another user_id'
);

select throws_ok(
  $$ update api.practice_sessions set lace_count = 999
     where user_id = '00000000-0000-0000-0000-00000000000c' and id = 'sesh-owned' $$,
  '42501', null, 'an authenticated client cannot update its own practice session after insertion'
);

select throws_ok(
  $$ delete from api.practice_sessions
     where user_id = '00000000-0000-0000-0000-00000000000c' and id = 'sesh-owned' $$,
  '42501', null, 'an authenticated client cannot delete its own practice session after insertion'
);

reset role;

select is(
  (select lace_count from api.practice_sessions where user_id = '00000000-0000-0000-0000-00000000000c' and id = 'sesh-owned'),
  12,
  'the practice session row is unchanged after the rejected update/delete attempts'
);

select * from finish();
rollback;
