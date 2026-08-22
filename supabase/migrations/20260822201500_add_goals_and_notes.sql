-- Model mutable goals and notes with soft-deletion tombstones (T155.4). Adds
-- the fifth and sixth application tables on top of the api/private schema
-- boundary (T155.1) and the ownership/JSON-invariant patterns established by
-- T155.2/T155.3.
--
-- Local domain mirrored (see src/features/goals/model/goal.ts and
-- src/features/notes/model/note.ts):
--   - api.goals mirrors Goal: a discriminated union on `kind` ('count' |
--     'time') with trick_id/trick_name as the authoritative snapshot (same
--     "never resolved from current source tricks" rule AGENTS.md documents
--     for sequence steps). The local reducer currently only adds/deletes
--     goals, but this schema also supports editing a goal's target in place
--     (T157.7 wires this up); that is why goals need the same
--     revision/tombstone machinery as notes, not just an insert/delete table.
--   - api.notes mirrors Note: trick_id/trick_name snapshot, a free-text body,
--     an optional practice_session_id association, and createdAt/updatedAt.
--     Unlike goals, the local model already supports editing (validateNoteEdit
--     / noteUpdated), so this table's revision bump is already exercised by
--     an existing local mutation, not just a future one.
--
-- Both tables are genuinely mutable (unlike api.practice_sessions) and use a
-- soft-deletion tombstone (`deleted_at`) rather than a hard DELETE, because a
-- future multi-device sync (T157.7/T157.8) needs every device to observe a
-- deletion fact, not just stop seeing a row. Consequently:
--   - There is no DELETE grant on either table at all (see section 6): a hard
--     DELETE is not a supported operation, only "insert" and "update"
--     (including the update that sets deleted_at). This is deliberately
--     narrower than T155.2/T155.3's custom_tricks, which does support hard
--     delete because it has no tombstone/sync requirement yet.
--   - A single shared trigger function (section 3) makes a tombstoned row's
--     `deleted_at` a terminal state: once set, no further UPDATE of any kind
--     succeeds against that row, including one attempting to clear
--     deleted_at (an "undelete") or edit any other column. This is what
--     prevents a stale mutation from silently recreating/resurrecting a
--     tombstoned record using the same identity and a stale revision value:
--     the rejection does not depend on the client's WHERE-clause revision
--     filter being correct (optimistic-concurrency WHERE clauses are an
--     application-layer/T157 concern), it is enforced unconditionally at the
--     row level before the update is allowed to take effect at all.
--   - The same trigger forces server ownership of revision/created_at/
--     updated_at/deleted_at/user_id/id on every insert and update, the same
--     "bootstrap now, T155.5 formalizes/extends across every table later"
--     posture T155.2/T155.3 already established for those tables' ownership
--     enforcement.

-- 1. api.goals: one row per (user, goal). `id` is the client-generated
--    stable id from createGoalId. trick_id/trick_name are the authoritative
--    snapshot (see api.user_trick_states/api.practice_sessions precedent):
--    no FK, because trick_id may name a standard Kentei trick (never a row
--    in this database) or a custom trick that may later be renamed/deleted.
create table api.goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,

  trick_id text not null,
  trick_name text not null,

  kind text not null,
  target_count integer,
  target_ms bigint,

  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  primary key (user_id, id),

  constraint goals_id_not_blank check (length(id) > 0),
  constraint goals_trick_id_not_blank check (length(trick_id) > 0),
  constraint goals_trick_name_shape
    check (length(trick_name) > 0 and trick_name = btrim(trick_name)),
  constraint goals_kind_known check (kind in ('count', 'time')),

  -- Mirrors MIN/MAX_GOAL_TARGET_COUNT (src/features/goals/model/goal.ts):
  -- a count goal always has an integer target_count in range and never a
  -- target_ms; the two target columns are mutually exclusive by kind so a
  -- row can never carry an ambiguous "both variants populated" payload.
  constraint goals_count_shape
    check (
      kind <> 'count'
      or (target_count between 1 and 100000 and target_ms is null)
    ),
  -- Mirrors MIN/MAX_GOAL_TARGET_MINUTES: targetMs is always
  -- targetMinutes * 60000 client-side, so it is always a whole-minute
  -- multiple of 60000 in range; a time goal never carries a target_count.
  constraint goals_time_shape
    check (
      kind <> 'time'
      or (
        target_ms between 60000 and 6000000000
        and target_ms % 60000 = 0
        and target_count is null
      )
    )
);

comment on table api.goals is
  'One row per practice goal owned by an account. Mirrors Goal (src/features/goals/model/goal.ts): a count|time discriminated union with a trick snapshot. Soft-deleted via deleted_at (see goals_notes_enforce_mutation_invariants); there is no DELETE grant.';

-- 2. api.notes: one row per (user, note). `id` is the client-generated
--    stable id from createNoteId. practice_session_id is optional and, when
--    present, must reference a real session for the same user -- this is the
--    "invalid session references" rejection the exit criteria call for. The
--    composite FK is satisfied vacuously when practice_session_id is null
--    (Postgres MATCH SIMPLE), so an unassociated note is unaffected.
create table api.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,

  trick_id text not null,
  trick_name text not null,
  body text not null,
  practice_session_id text,

  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  primary key (user_id, id),

  constraint notes_id_not_blank check (length(id) > 0),
  constraint notes_trick_id_not_blank check (length(trick_id) > 0),
  constraint notes_trick_name_shape
    check (length(trick_name) > 0 and trick_name = btrim(trick_name)),
  constraint notes_body_shape check (length(body) > 0 and body = btrim(body)),
  constraint notes_practice_session_id_not_blank
    check (practice_session_id is null or length(practice_session_id) > 0),

  -- A note's optional session association can only ever point at that same
  -- user's own practice session; on delete set null rather than cascade,
  -- because practice_sessions rows are never deleted independently today
  -- (no delete grant exists on that table) -- this only protects against a
  -- future change to that table's delete surface leaving orphaned notes.
  foreign key (user_id, practice_session_id)
    references api.practice_sessions (user_id, id)
    on delete set null
);

comment on table api.notes is
  'One row per free-text practice note owned by an account. Mirrors Note (src/features/notes/model/note.ts): trick snapshot, body, and an optional practice_session_id association. Soft-deleted via deleted_at (see goals_notes_enforce_mutation_invariants); there is no DELETE grant.';

-- 3. Shared mutation-invariant trigger. Both tables have identical
--    revision/created_at/updated_at/deleted_at/user_id/id columns, so one
--    function (referencing NEW/OLD by column name, and TG_TABLE_NAME only
--    for error messages) covers both:
--      - INSERT: server always owns revision (reset to 1), created_at/
--        updated_at (reset to now()), and deleted_at (reset to null),
--        regardless of what the client's insert payload contained.
--      - UPDATE, already tombstoned (old.deleted_at is not null): rejected
--        unconditionally. This is the terminal-tombstone enforcement: no
--        update can edit a tombstoned row's other columns, and none can
--        clear deleted_at to "undelete" it, whatever revision number the
--        stale mutation's WHERE clause or payload assumed.
--      - UPDATE, not yet tombstoned: user_id/id/created_at are pinned to
--        their existing values (ownership/identity are immutable), revision
--        is always old.revision + 1 (never client-chosen), updated_at is
--        always now(), and if the client's payload sets deleted_at at all,
--        the server timestamp (now()) is substituted for whatever value the
--        client supplied -- the tombstone moment is also server-owned.
create function private.enforce_goal_note_mutation_invariants()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
    return new;
  end if;

  -- TG_OP = 'UPDATE'
  if old.deleted_at is not null then
    raise exception 'cannot modify a tombstoned % row (user %, id %)', TG_TABLE_NAME, old.user_id, old.id
      using errcode = '23514';
  end if;

  new.user_id := old.user_id;
  new.id := old.id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;

  return new;
end;
$$;

create trigger goals_enforce_mutation_invariants
before insert or update on api.goals
for each row execute function private.enforce_goal_note_mutation_invariants();

create trigger notes_enforce_mutation_invariants
before insert or update on api.notes
for each row execute function private.enforce_goal_note_mutation_invariants();

-- 4. User-scoped pagination/ordering indexes, matching the
--    (user_id, created_at desc, id) convention T155.3 established for
--    custom_tricks/practice_sessions.
create index goals_user_created_at_idx
  on api.goals (user_id, created_at desc, id);

create index notes_user_created_at_idx
  on api.notes (user_id, created_at desc, id);

-- 5. Ownership. Both tables use the same USING/WITH CHECK-against-auth.uid()
--    pattern as every prior table; ownership itself is never client-
--    controlled (also pinned by the trigger above as defense in depth).
alter table api.goals enable row level security;
alter table api.notes enable row level security;

-- 6. Grants: select/insert/update only, deliberately omitting delete on both
--    tables. A hard DELETE would let a client destroy a row's identity
--    outright, bypassing the tombstone model entirely and erasing a fact
--    other devices need to observe during sync (T157.7/T157.8) -- so, as
--    with practice_sessions' narrower grant, the absence of a DELETE grant
--    is itself part of the enforcement, not merely RLS-policy scope.
grant select, insert, update on api.goals to authenticated;
grant select, insert, update on api.notes to authenticated;

create policy goals_select_own on api.goals
  for select
  to authenticated
  using (user_id = auth.uid());

create policy goals_insert_own on api.goals
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy goals_update_own on api.goals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notes_select_own on api.notes
  for select
  to authenticated
  using (user_id = auth.uid());

create policy notes_insert_own on api.notes
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy notes_update_own on api.notes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
