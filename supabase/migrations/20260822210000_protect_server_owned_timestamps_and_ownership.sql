-- Protect server-owned timestamps, revisions, and ownership (T155.5). This
-- is an audit/hardening pass over every table T155.2-T155.4 already created;
-- it adds no new tables. It closes two kinds of gap those tickets explicitly
-- deferred to this one:
--
--   1. api.profiles, api.user_trick_states, and api.custom_tricks had column
--      defaults (revision/created_at/updated_at) but no trigger forcing
--      them on every write, unlike api.goals/api.notes (T155.4), which
--      already got a real ownership-enforcing trigger because their tombstone
--      exit criteria required one immediately. A client INSERT or UPDATE
--      against those three tables could set revision/created_at/updated_at
--      (and, for user_trick_states/custom_tricks, id/kind/trick_id identity
--      columns) to any value it chose, because only RLS scoped *which rows*
--      were reachable, never *which column values* were acceptable within a
--      reachable row. api.practice_sessions had the same gap for its single
--      receipt timestamp, created_at (its historical-fact columns --
--      started_at/completed_at/duration_ms/lace_count -- are deliberately
--      client-supplied and already validated by CHECK constraints; only
--      created_at, "when the server recorded this row," is server-owned).
--
--   2. No function in this schema set an explicit `search_path`, which is
--      Postgres/Supabase best practice for every function regardless of
--      SECURITY DEFINER/INVOKER, to prevent a hijacked search path from
--      resolving an unqualified identifier to an attacker-controlled object.
--      `search_path = ''` is used rather than `pg_catalog, pg_temp` because
--      pg_catalog is *always* implicitly searched first when the session's
--      path does not otherwise mention it (see the Postgres docs on the
--      search path), so every existing unqualified builtin call in these
--      functions (now(), jsonb_typeof(), btrim(), etc.) keeps resolving to
--      the real pg_catalog builtin with no call site rewrite required; only
--      references to `api`/`private` objects need to stay schema-qualified,
--      and they already are.
--
-- No function in this project is declared SECURITY DEFINER (every function
-- below stays SECURITY INVOKER, the default): each one only ever inspects or
-- rewrites NEW/OLD of the row the invoking role's own RLS-scoped statement
-- already reached, so none needs the owning role's elevated privileges. The
-- "every SECURITY DEFINER function has an audited fixed search_path" exit
-- criterion therefore holds vacuously today; if a future ticket introduces
-- one, it must set search_path following this migration's precedent.

-- 1. Fix search_path on the two functions T155.3/T155.4 already created.
--    ALTER FUNCTION ... SET is sufficient (a session-level GUC override
--    baked into the function's pg_proc.proconfig); it does not require
--    recreating the function body.
alter function private.enforce_custom_trick_step_invariants()
  set search_path = '';

alter function private.enforce_goal_note_mutation_invariants()
  set search_path = '';

-- 2. api.profiles: own revision/created_at/updated_at, and pin user_id, on
--    every insert/update. Mirrors the shape of T155.4's shared trigger, but
--    profiles has no id/tombstone columns, so it gets its own function
--    rather than forcing an artificial shared shape onto a mismatched table.
create function private.enforce_profile_mutation_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- TG_OP = 'UPDATE'
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_enforce_mutation_invariants
before insert or update on api.profiles
for each row execute function private.enforce_profile_mutation_invariants();

-- 3. api.user_trick_states: own revision/created_at/updated_at/id on insert;
--    pin user_id/id/trick_id (the row's identity) and own
--    revision/updated_at on update. trick_id is pinned because it, together
--    with user_id, is this row's whole reason for existing (the
--    user_trick_states_unique_per_user constraint) -- letting an UPDATE
--    repoint trick_id would let a client silently retarget an existing
--    selection/unlock row onto a different trick's identity instead of
--    inserting a new row for it.
create function private.enforce_user_trick_state_mutation_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    new.id := gen_random_uuid();
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- TG_OP = 'UPDATE'
  new.id := old.id;
  new.user_id := old.user_id;
  new.trick_id := old.trick_id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_trick_states_enforce_mutation_invariants
before insert or update on api.user_trick_states
for each row execute function private.enforce_user_trick_state_mutation_invariants();

-- 4. api.custom_tricks: own revision/created_at/updated_at on insert; pin
--    user_id/id/kind (own revision/updated_at) on update. `kind` is pinned
--    because nothing in the local domain (createCustomTrick) or this
--    migration's own step-invariant trigger supports converting a live row
--    between standalone and sequence in place -- a client edit always
--    replaces name/kentei_rank/steps within the same kind. This is a new
--    trigger, separate from T155.3's
--    private.enforce_custom_trick_step_invariants, which owns step-shape/
--    nesting rules only; both fire BEFORE INSERT OR UPDATE and, since this
--    one's name sorts before "custom_tricks_enforce_step_invariants"
--    alphabetically, it runs first (though the two touch disjoint columns,
--    so firing order is not actually load-bearing here).
create function private.enforce_custom_trick_mutation_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- TG_OP = 'UPDATE'
  new.user_id := old.user_id;
  new.id := old.id;
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger custom_tricks_enforce_mutation_invariants
before insert or update on api.custom_tricks
for each row execute function private.enforce_custom_trick_mutation_invariants();

-- 5. api.practice_sessions: own created_at (the row's "receipt" timestamp --
--    when the server recorded this immutable history fact) on insert.
--    started_at/completed_at/duration_ms/lace_count/planned_duration_ms
--    remain client-supplied historical fact, per T155.3's own comments; nothing
--    here touches them. No UPDATE trigger is needed: T155.3 already grants no
--    UPDATE privilege on this table at all (see also the column-level
--    tightening in section 6, which is pure defense-in-depth here).
create function private.enforce_practice_session_receipt_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger practice_sessions_enforce_receipt_timestamp
before insert on api.practice_sessions
for each row execute function private.enforce_practice_session_receipt_timestamp();

-- 6. Column-level grants: defense-in-depth beyond RLS and the triggers
--    above. Today, every gap the triggers close is already unreachable
--    end-to-end (a forged value is silently overwritten, never stored) --
--    but a forged PATCH/POST that merely targets a server-owned column
--    should itself be rejected outright (42501, insufficient_privilege)
--    rather than silently rewritten, so a client can distinguish "my request
--    was malformed" from "my request succeeded." Postgres has no way to
--    revoke a privilege at the column level while the equivalent table-level
--    grant still stands (the table-level grant is checked first and
--    implies the privilege on every column) -- each block below revokes the
--    whole-table INSERT/UPDATE grant T155.2-T155.4 made and re-grants it
--    column-by-column, naming only the columns a legitimate client request
--    ever needs to write. SELECT and DELETE (where granted) are unaffected;
--    only INSERT/UPDATE are ever column-scoped here.

-- api.profiles: mutable columns are exactly UserProfile's own editable
-- fields; user_id/revision/created_at/updated_at are fully server-owned.
revoke insert, update on api.profiles from authenticated;

grant insert (
  user_id, has_completed_onboarding, kentei_rank, last_sesh,
  streak_threshold_ms, theme_background_color, theme_accent_color, theme_text_color
) on api.profiles to authenticated;

grant update (
  has_completed_onboarding, kentei_rank, last_sesh,
  streak_threshold_ms, theme_background_color, theme_accent_color, theme_text_color
) on api.profiles to authenticated;

-- api.user_trick_states: id/revision/created_at/updated_at are fully
-- server-owned; user_id/trick_id are client-supplied identity at insert
-- time only (immutable thereafter, per the trigger above) and so are never
-- grantable for UPDATE.
revoke insert, update on api.user_trick_states from authenticated;

grant insert (
  user_id, trick_id, is_selected, is_manually_unlocked
) on api.user_trick_states to authenticated;

grant update (
  is_selected, is_manually_unlocked
) on api.user_trick_states to authenticated;

-- api.custom_tricks: user_id/id/kind are client-supplied identity at insert
-- time only (immutable thereafter); revision/created_at/updated_at are
-- fully server-owned.
revoke insert, update on api.custom_tricks from authenticated;

grant insert (
  user_id, id, kind, name, kentei_rank, steps
) on api.custom_tricks to authenticated;

grant update (
  name, kentei_rank, steps
) on api.custom_tricks to authenticated;

-- api.practice_sessions: created_at is fully server-owned; every other
-- column is legitimate client-supplied historical fact at insert time (this
-- table has no UPDATE grant at all, from T155.3, so there is no update
-- column list to narrow).
revoke insert on api.practice_sessions from authenticated;

grant insert (
  user_id, id, trick_id, trick_name, started_at, completed_at,
  duration_ms, lace_count, planned_duration_ms, origin
) on api.practice_sessions to authenticated;

-- api.goals: id/user_id/created_at/revision/updated_at are fully
-- server-owned; trick_id/trick_name/kind/target_count/target_ms are
-- client-supplied identity/content at insert time. deleted_at is the
-- one column genuinely meant to be UPDATE-granted here: setting it is how a
-- client requests a soft delete, even though
-- private.enforce_goal_note_mutation_invariants always substitutes now()
-- for whatever value is sent. T157.7's own later migration
-- (20260823010000_extend_goals_update_grant_for_target_editing.sql) extends
-- the UPDATE grant to also cover target_count/target_ms, once in-place goal
-- target editing exists locally -- trick_id/trick_name/kind stay
-- UPDATE-ungranted forever; a goal's trick and kind are fixed at creation.
revoke insert, update on api.goals from authenticated;

grant insert (
  user_id, id, trick_id, trick_name, kind, target_count, target_ms
) on api.goals to authenticated;

grant update (
  deleted_at
) on api.goals to authenticated;

-- api.notes: same reasoning as goals, except `body` is already genuinely
-- editable today (validateNoteEdit / noteUpdated), so it is UPDATE-granted
-- alongside deleted_at.
revoke insert, update on api.notes from authenticated;

grant insert (
  user_id, id, trick_id, trick_name, body, practice_session_id
) on api.notes to authenticated;

grant update (
  body, deleted_at
) on api.notes to authenticated;
