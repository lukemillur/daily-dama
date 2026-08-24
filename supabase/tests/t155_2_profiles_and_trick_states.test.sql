begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Fixture auth users.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 1-4: valid UserProfile variants.
select lives_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding)
     values ('00000000-0000-0000-0000-00000000000a', false) $$,
  'minimal not-onboarded profile is valid'
);

select lives_ok(
  $$ insert into api.profiles (
       user_id, has_completed_onboarding, kentei_rank, last_sesh,
       streak_threshold_ms, theme_background_color, theme_accent_color, theme_text_color
     ) values (
       '00000000-0000-0000-0000-00000000000b', true, 5,
       '{"trickId":"lighthouse","plan":{"kind":"openEnded"}}',
       300000, '#ff00aa', '#00ff00', '#0000ff'
     ) $$,
  'fully populated onboarded profile with openEnded lastSesh (no target) is valid'
);

select lives_ok(
  $$ update api.profiles set last_sesh =
       '{"trickId":"t1","plan":{"kind":"openEnded","targetLandingCount":999}}'
     where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  'openEnded lastSesh with boundary targetLandingCount=999 is valid'
);

select lives_ok(
  $$ update api.profiles set last_sesh =
       '{"trickId":"t1","plan":{"kind":"timed","durationMinutes":60}}'
     where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  'timed lastSesh with boundary durationMinutes=60 is valid'
);

-- 5-7: invalid Kentei ranks.
select throws_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding, kentei_rank)
     values ('00000000-0000-0000-0000-00000000000a', true, 0) $$,
  '23514', null, 'kentei_rank=0 is rejected'
);

select throws_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding, kentei_rank)
     values ('00000000-0000-0000-0000-00000000000a', true, 13) $$,
  '23514', null, 'kentei_rank=13 is rejected'
);

select throws_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding, kentei_rank)
     values ('00000000-0000-0000-0000-00000000000a', false, 5) $$,
  '23514', null, 'kentei_rank set while onboarding incomplete is rejected'
);

select throws_ok(
  $$ update api.profiles set kentei_rank = null where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'onboarded profile missing kentei_rank is rejected'
);

-- 9-12: invalid theme variants.
select throws_ok(
  $$ update api.profiles set theme_background_color = 'ff00aa'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'theme color missing # is rejected'
);

select throws_ok(
  $$ update api.profiles set theme_background_color = '#ff00'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'theme color with too few digits is rejected'
);

-- 11-12: invalid streak variants.
select throws_ok(
  $$ update api.profiles set streak_threshold_ms = 90000
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'streak threshold not a whole multiple of 60000ms is rejected'
);

select throws_ok(
  $$ update api.profiles set streak_threshold_ms = 3600001
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'streak threshold above 60 minutes is rejected'
);

-- 13-17: invalid lastSesh variants.
select throws_ok(
  $$ update api.profiles set last_sesh = '{"trickId":"t1","plan":{"kind":"bogus"}}'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'lastSesh with unknown plan kind is rejected'
);

select throws_ok(
  $$ update api.profiles set last_sesh = '{"trickId":"t1","plan":{"kind":"openEnded","extra":true}}'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'lastSesh openEnded with unknown extra key is rejected'
);

select throws_ok(
  $$ update api.profiles set last_sesh = '{"trickId":"t1","plan":{"kind":"openEnded","targetLandingCount":1000}}'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'lastSesh openEnded targetLandingCount above 999 is rejected'
);

select throws_ok(
  $$ update api.profiles set last_sesh = '{"trickId":"t1","plan":{"kind":"timed","durationMinutes":61}}'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'lastSesh timed durationMinutes above 60 is rejected'
);

select throws_ok(
  $$ update api.profiles set last_sesh = '{"trickId":"","plan":{"kind":"timed","durationMinutes":10}}'
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'lastSesh with empty trickId is rejected'
);

-- 18-19: duplicate trick states.
select lives_ok(
  $$ insert into api.user_trick_states (user_id, trick_id, is_selected)
     values ('00000000-0000-0000-0000-00000000000a', 'lighthouse', true) $$,
  'a single trick-state row is valid'
);

select throws_ok(
  $$ insert into api.user_trick_states (user_id, trick_id, is_selected)
     values ('00000000-0000-0000-0000-00000000000a', 'lighthouse', true) $$,
  '23505', null, 'a duplicate (user_id, trick_id) trick-state row is rejected'
);

select throws_ok(
  $$ insert into api.user_trick_states (user_id, trick_id)
     values ('00000000-0000-0000-0000-00000000000a', 'other-trick') $$,
  '23514', null, 'a trick-state row with neither flag set is rejected'
);

-- 21-22: cascade deletion.
select is(
  (select count(*)::int from api.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), 1,
  'sanity: profile exists before account deletion'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is(
  (select count(*)::int from api.profiles where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'deleting the auth user cascades to delete its profile row'
);

select is(
  (select count(*)::int from api.user_trick_states where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'deleting the auth user cascades to delete its trick-state rows'
);

-- 23-24: ownership cannot be client-assigned.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$ insert into api.profiles (user_id, has_completed_onboarding)
     values ('11111111-1111-1111-1111-111111111111', false) $$,
  '42501', null, 'an authenticated client cannot insert a profile row for another user_id'
);

select throws_ok(
  $$ update api.profiles set user_id = '11111111-1111-1111-1111-111111111111'
     where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'an authenticated client cannot reassign an existing row to another user_id'
);

reset role;

select * from finish();
rollback;
