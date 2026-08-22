-- Model custom tricks and immutable practice-history sessions (T155.3). Adds
-- the third and fourth application tables on top of the api/private schema
-- boundary (T155.1) and the ownership/JSON-invariant patterns established by
-- T155.2 (api.profiles, api.user_trick_states).
--
-- Local domain mirrored (see AGENTS.md "Custom-trick model invariants" and
-- "Sesh and Stats behavior", and src/features/custom-tricks/model/custom-trick.ts,
-- src/features/stats/model/practice-history.ts):
--   - api.custom_tricks mirrors CustomTrick (standalone | sequence). Sequence
--     steps are a discriminated union (existingTrick: sourceTrickId + name
--     snapshot; customText: name only). Sequences may reference standard
--     tricks (opaque, not in this database) or standalone custom tricks, but
--     never another sequence -- enforced centrally by one trigger function,
--     mirroring how selectSequenceStepCandidates centralizes the same rule
--     client-side.
--   - api.practice_sessions mirrors PracticeSessionRecord: an immutable,
--     insert-only historical snapshot (trick id + name, timing, lace count).
--     "Client-fact timing" means started_at/completed_at/duration_ms are
--     supplied by the client as historical fact (the Sesh reducer already
--     owns countdown/active/completed transitions locally); this migration
--     validates shape and internal consistency, not elapsed-time correctness.
--
-- As with T155.2, server-owned timestamp/revision triggers and comprehensive
-- per-operation grant audits are T155.5-T155.7's concern; this migration
-- still needs working ownership enforcement and domain invariants now
-- because its own exit criteria require proving both today.

-- 1. api.custom_tricks: one row per (user, custom trick). `id` is the
--    client-generated stable id from createCustomTrickId, unrelated to the
--    editable `name` -- renaming a trick never changes its id, and nothing
--    here regenerates it. Primary key is (user_id, id): stable per account,
--    and naturally rejects a duplicate id for the same user re-using
--    createCustomTrickId's collision-resistant scheme.
create table api.custom_tricks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,

  kind text not null,
  name text not null,
  kentei_rank smallint,
  -- Sequence steps live as a jsonb array here rather than a child table:
  -- like api.profiles.last_sesh, they are a small, wholesale-replaced,
  -- read-together-with-the-parent document, not independently queried rows.
  steps jsonb,

  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, id),

  constraint custom_tricks_id_not_blank check (length(id) > 0),
  constraint custom_tricks_kind_known check (kind in ('standalone', 'sequence')),
  constraint custom_tricks_name_shape check (length(name) > 0 and name = btrim(name)),
  constraint custom_tricks_kentei_rank_range
    check (kentei_rank is null or kentei_rank between 1 and 12),

  -- Cheap, purely-scalar shape checks live here as ordinary CHECK
  -- constraints. Per-element step validation and the nested-sequence rule
  -- need to inspect array elements and (for nesting) sibling rows, which
  -- CHECK constraints cannot do (no subqueries, no other-row visibility) --
  -- both live in the trigger below instead.
  constraint custom_tricks_standalone_has_no_steps
    check (kind <> 'standalone' or steps is null),
  constraint custom_tricks_sequence_steps_shape
    check (
      kind <> 'sequence'
      or (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) >= 2)
    )
);

comment on table api.custom_tricks is
  'One row per custom trick (standalone or sequence) owned by an account. Mirrors CustomTrick (src/features/custom-tricks/model/custom-trick.ts). id is the stable client-generated id; name is independently editable. Sequence steps are validated (shape + no nesting) by custom_tricks_enforce_step_invariants.';

-- 2. Centralized step-shape and no-nested-sequences enforcement. Runs on
--    every insert/update because both directions of the nesting rule need
--    checking, not just "this row's own steps":
--      (a) a sequence's own existingTrick steps must not point at another
--          row that is itself kind = 'sequence' (the direct case: creating
--          or editing a sequence to reference another sequence).
--      (b) a row becoming/remaining kind = 'sequence' must not already be
--          referenced as an existingTrick step by some *other* sequence
--          (the retroactive case: converting a standalone trick that an
--          existing sequence already references into a sequence itself).
--    Self-reference (a sequence step naming its own row) is rejected as a
--    degenerate case of (a).
create function private.enforce_custom_trick_step_invariants()
returns trigger
language plpgsql
as $$
declare
  step jsonb;
  referenced_kind text;
  referencing_count integer;
begin
  if new.kind = 'sequence' and jsonb_typeof(new.steps) = 'array' then
    for step in select * from jsonb_array_elements(new.steps)
    loop
      if jsonb_typeof(step) <> 'object'
        or not (step ? 'kind')
        or not (step ? 'name')
        or jsonb_typeof(step -> 'name') <> 'string'
        or length(step ->> 'name') = 0
        or step ->> 'name' <> btrim(step ->> 'name')
      then
        raise exception 'malformed sequence step: %', step using errcode = '23514';
      end if;

      if step ->> 'kind' = 'customText' then
        if step <> jsonb_build_object('kind', 'customText', 'name', step -> 'name') then
          raise exception 'malformed customText step (unexpected keys): %', step using errcode = '23514';
        end if;

      elsif step ->> 'kind' = 'existingTrick' then
        if not (step ? 'sourceTrickId')
          or jsonb_typeof(step -> 'sourceTrickId') <> 'string'
          or length(step ->> 'sourceTrickId') = 0
          or step <> jsonb_build_object(
               'kind', 'existingTrick', 'name', step -> 'name', 'sourceTrickId', step -> 'sourceTrickId'
             )
        then
          raise exception 'malformed existingTrick step: %', step using errcode = '23514';
        end if;

        if step ->> 'sourceTrickId' = new.id then
          raise exception 'a sequence cannot reference itself as a step (trick %)', new.id
            using errcode = '23514';
        end if;

        select ct.kind into referenced_kind
        from api.custom_tricks ct
        where ct.user_id = new.user_id and ct.id = step ->> 'sourceTrickId';

        if referenced_kind = 'sequence' then
          raise exception 'nested sequences are not allowed (step references sequence %)', step ->> 'sourceTrickId'
            using errcode = '23514';
        end if;

      else
        raise exception 'unknown sequence step kind: %', step ->> 'kind' using errcode = '23514';
      end if;
    end loop;

    select count(*) into referencing_count
    from api.custom_tricks ct
    cross join lateral jsonb_array_elements(ct.steps) as s(value)
    where ct.user_id = new.user_id
      and ct.kind = 'sequence'
      and ct.id <> new.id
      and s.value ->> 'kind' = 'existingTrick'
      and s.value ->> 'sourceTrickId' = new.id;

    if referencing_count > 0 then
      raise exception 'trick % cannot become a sequence: it is already referenced as a step by another sequence', new.id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger custom_tricks_enforce_step_invariants
before insert or update on api.custom_tricks
for each row execute function private.enforce_custom_trick_step_invariants();

-- 3. api.practice_sessions: one row per completed Sesh, mirroring
--    PracticeSessionRecord (src/features/stats/model/practice-history.ts).
--    trick_id/trick_name are the authoritative snapshot -- editing or
--    deleting a custom trick must never rewrite historical Stats, so there
--    is deliberately no FK to api.custom_tricks (same reasoning as
--    api.user_trick_states.trick_id: it may name a standard Kentei trick,
--    which never has a row in this database, or a custom trick that may
--    later be renamed or deleted). Timestamps are epoch milliseconds
--    (client-fact timing), matching the numbers already stored locally.
create table api.practice_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,

  trick_id text not null,
  trick_name text not null,

  started_at bigint not null,
  completed_at bigint not null,
  duration_ms bigint not null,
  lace_count integer not null,

  -- Set only for a comparable timed attempt (see isEligibleTimedAttempt);
  -- absent for open-ended seshes and for timed seshes that don't qualify.
  planned_duration_ms bigint,
  -- Set only for a Kentei-assessment-recorded session; absent otherwise.
  origin text,

  created_at timestamptz not null default now(),

  primary key (user_id, id),

  constraint practice_sessions_id_not_blank check (length(id) > 0),
  constraint practice_sessions_trick_id_not_blank check (length(trick_id) > 0),
  constraint practice_sessions_trick_name_shape
    check (length(trick_name) > 0 and trick_name = btrim(trick_name)),

  constraint practice_sessions_started_at_positive check (started_at > 0),
  constraint practice_sessions_completed_not_before_started
    check (completed_at >= started_at),
  constraint practice_sessions_duration_matches_timing
    check (duration_ms = completed_at - started_at),
  constraint practice_sessions_lace_count_nonnegative check (lace_count >= 0),
  constraint practice_sessions_planned_duration_positive
    check (planned_duration_ms is null or planned_duration_ms > 0),
  constraint practice_sessions_origin_known
    check (origin is null or origin = 'assessment')
);

comment on table api.practice_sessions is
  'One immutable row per completed Sesh. Mirrors PracticeSessionRecord (src/features/stats/model/practice-history.ts). Insert-only: no update/delete grant or policy exists for authenticated (see RLS below), matching the local invariant that historical Stats records never change after being recorded.';

-- 4. User-scoped pagination indexes. Both tables are read back "give me
--    this account's rows, most-recent-first, a page at a time"; the
--    (user_id, id) primary key alone only supports id-ordered access.
create index custom_tricks_user_created_at_idx
  on api.custom_tricks (user_id, created_at desc, id);

create index practice_sessions_user_completed_at_idx
  on api.practice_sessions (user_id, completed_at desc, id);

-- 5. Ownership and immutability. custom_tricks follows T155.2's own-row
--    pattern (full CRUD, scoped to auth.uid()). practice_sessions is
--    deliberately narrower: only select/insert are granted at all, and only
--    select/insert policies exist, so there is no permissive path to
--    update or delete a row post-insert -- a client attempt fails with a
--    plain permission error (42501) before RLS policy evaluation even
--    matters, giving defense in depth against a future accidental grant.
alter table api.custom_tricks enable row level security;
alter table api.practice_sessions enable row level security;

grant select, insert, update, delete on api.custom_tricks to authenticated;
grant select, insert on api.practice_sessions to authenticated;

create policy custom_tricks_own_row on api.custom_tricks
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy practice_sessions_select_own on api.practice_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy practice_sessions_insert_own on api.practice_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());
