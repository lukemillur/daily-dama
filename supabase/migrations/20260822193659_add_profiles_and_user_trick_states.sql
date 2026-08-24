-- Model per-account profiles and per-trick user state (T155.2). Adds the
-- first two application tables on top of the api/private schema boundary
-- established by T155.1. Server-owned timestamp/revision *triggers*,
-- comprehensive per-operation grants, and centralized JSON-invariant helpers
-- are deliberately owned by later tickets (T155.5-T155.7); this migration
-- still needs a *working* ownership-enforcement mechanism and domain
-- invariants now, because its own exit criteria require proving both today.
-- Expect T155.5/T155.7 to formalize/extend what is bootstrapped here rather
-- than to introduce these mechanisms from scratch.

-- 1. api.profiles: one row per Supabase Auth user, mirroring the local
--    `UserProfile` shape (src/features/profile/model/user-profile.ts) minus
--    its two trick-id array fields, which live in api.user_trick_states
--    instead (see below). `user_id` is both the primary key and the FK, so
--    there is exactly one profile row per account and it cannot be
--    re-parented to a different id.
create table api.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  has_completed_onboarding boolean not null default false,
  kentei_rank smallint,
  last_sesh jsonb,
  streak_threshold_ms integer,
  theme_background_color text,
  theme_accent_color text,
  theme_text_color text,

  -- Optimistic-concurrency counter for future sync (Phase 3). No tombstone
  -- column: a profile is deleted only by `on delete cascade` when the
  -- owning auth.users row is deleted (account deletion), never by a
  -- client-initiated soft delete.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_kentei_rank_range
    check (kentei_rank is null or kentei_rank between 1 and 12),
  constraint profiles_kentei_rank_requires_onboarding
    check (
      (has_completed_onboarding and kentei_rank is not null)
      or (not has_completed_onboarding and kentei_rank is null)
    ),

  constraint profiles_streak_threshold_range
    check (
      streak_threshold_ms is null
      or (
        streak_threshold_ms % 60000 = 0
        and streak_threshold_ms between 60000 and 3600000
      )
    ),

  constraint profiles_theme_background_color_format
    check (theme_background_color is null or theme_background_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint profiles_theme_accent_color_format
    check (theme_accent_color is null or theme_accent_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint profiles_theme_text_color_format
    check (theme_text_color is null or theme_text_color ~ '^#[0-9a-fA-F]{6}$'),

  constraint profiles_last_sesh_shape
    check (
      last_sesh is null or (
        jsonb_typeof(last_sesh) = 'object'
        and (last_sesh ?& array['trickId', 'plan'])
        and last_sesh <@ jsonb_build_object('trickId', last_sesh->'trickId', 'plan', last_sesh->'plan')
        and jsonb_typeof(last_sesh->'trickId') = 'string'
        and length(last_sesh->>'trickId') > 0
        and jsonb_typeof(last_sesh->'plan') = 'object'
        and (last_sesh->'plan' ? 'kind')
        and (
          (
            last_sesh->'plan'->>'kind' = 'openEnded'
            and (last_sesh->'plan') <@ jsonb_build_object(
              'kind', 'openEnded',
              'targetLandingCount', last_sesh->'plan'->'targetLandingCount'
            )
            and (
              not (last_sesh->'plan' ? 'targetLandingCount')
              or (
                jsonb_typeof(last_sesh->'plan'->'targetLandingCount') = 'number'
                and (last_sesh->'plan'->>'targetLandingCount')::numeric between 1 and 999
                and (last_sesh->'plan'->>'targetLandingCount')::numeric
                  = floor((last_sesh->'plan'->>'targetLandingCount')::numeric)
              )
            )
          )
          or (
            last_sesh->'plan'->>'kind' = 'timed'
            and (last_sesh->'plan') <@ jsonb_build_object(
              'kind', 'timed',
              'durationMinutes', last_sesh->'plan'->'durationMinutes'
            )
            and (last_sesh->'plan' ? 'durationMinutes')
            and jsonb_typeof(last_sesh->'plan'->'durationMinutes') = 'number'
            and (last_sesh->'plan'->>'durationMinutes')::numeric between 1 and 60
          )
        )
      )
    )
);

comment on table api.profiles is
  'One row per Supabase Auth account. Mirrors UserProfile (src/features/profile/model/user-profile.ts) minus selectedTrickIds/manuallyUnlockedTrickIds, which live in api.user_trick_states.';

-- 2. api.user_trick_states: one row per (user, trick) that is either
--    selected for practice or manually laced/unlocked, mirroring the local
--    `selectedTrickIds`/`manuallyUnlockedTrickIds` arrays. `trick_id` is a
--    free-form opaque identifier (no FK): it may name a standard Kentei
--    trick (defined only in app code, not the database) or a custom trick
--    (whose table arrives in T155.3), so it cannot reference either today.
create table api.user_trick_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trick_id text not null check (length(trick_id) > 0),

  is_selected boolean not null default false,
  is_manually_unlocked boolean not null default false,

  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_trick_states_unique_per_user unique (user_id, trick_id),
  constraint user_trick_states_has_state check (is_selected or is_manually_unlocked)
);

comment on table api.user_trick_states is
  'One row per (user, trick) that is selected for practice and/or manually laced/unlocked. Mirrors UserProfile.selectedTrickIds/manuallyUnlockedTrickIds. trick_id is an opaque id with no FK: it may name a standard Kentei trick (app-code only) or a future custom trick (T155.3).';

-- 3. Ownership enforcement: `user_id` is never client-controlled. RLS
--    policies compare every row against `auth.uid()` for both the existing
--    row (USING) and the proposed row (WITH CHECK), so a client cannot
--    insert a row claiming another user's id, and cannot repoint an
--    existing row at another user's id via UPDATE. This also happens to
--    give cross-user SELECT/UPDATE/DELETE isolation, which T155.7 will
--    audit and extend per-table (e.g. making practice_sessions
--    select/insert-only); nothing here should be read as the final grant
--    surface for every table.
alter table api.profiles enable row level security;
alter table api.user_trick_states enable row level security;

grant select, insert, update, delete on api.profiles to authenticated;
grant select, insert, update, delete on api.user_trick_states to authenticated;

create policy profiles_own_row on api.profiles
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_trick_states_own_row on api.user_trick_states
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
