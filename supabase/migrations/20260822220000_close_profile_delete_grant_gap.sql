-- Close a leftover authorization gap on api.profiles (T155.7). T155.2's
-- original grant included DELETE on api.profiles, contradicting that same
-- migration's own comment: "No tombstone column: a profile is deleted only
-- by `on delete cascade` ... never by a client-initiated soft delete."
-- Verified live before this fix: an authenticated user could
-- `DELETE /rest/v1/profiles?user_id=eq.<self>` and it succeeded. This
-- migration narrows the grant and splits the single `for all` policy into
-- explicit per-operation policies (matching the style T155.4 established for
-- goals/notes), so the policy surface no longer silently covers an operation
-- that should never be reachable. It also adds FORCE ROW LEVEL SECURITY to
-- every exposed table as defense-in-depth.
--
-- This repo's migrations are append-only: this file adds to
-- 20260822193659_add_profiles_and_user_trick_states.sql rather than editing
-- it in place.

-- 1. Revoke the over-broad DELETE grant. No other table's grant is touched:
--    user_trick_states' DELETE grant is correct and load-bearing (it is the
--    only legal way to fully clear is_selected/is_manually_unlocked, per
--    that table's own CHECK constraint), and custom_tricks' DELETE grant is
--    also correct and deliberate (full CRUD, no tombstone requirement).
revoke delete on api.profiles from authenticated;

-- 2. Split profiles' single `for all` policy into explicit per-operation
--    policies. This isn't strictly required for correctness -- the grant
--    revocation above already blocks DELETE outright -- but it removes a
--    latent trap: today the `for all` policy silently still *covers* DELETE
--    even though no grant reaches it, so a future accidental
--    `grant delete on api.profiles to authenticated` would immediately
--    become exploitable with zero policy change needed. Splitting the
--    policy now, while it's free, removes that landmine.
drop policy profiles_own_row on api.profiles;

create policy profiles_select_own on api.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy profiles_insert_own on api.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy profiles_update_own on api.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. FORCE ROW LEVEL SECURITY on every exposed table, as recorded
--    defense-in-depth. Verified live (`select rolname, rolsuper,
--    rolbypassrls from pg_roles`) that the `postgres` migration/owner role
--    has `rolbypassrls = true` as a directly granted role attribute, not
--    merely via table ownership -- so FORCE ROW LEVEL SECURITY changes no
--    observable behavior today (BYPASSRLS always wins over FORCE, by
--    Postgres's own semantics) and no test can demonstrate it doing
--    anything. It only protects against a future owner-role change that
--    lacks BYPASSRLS.
alter table api.profiles force row level security;
alter table api.user_trick_states force row level security;
alter table api.custom_tricks force row level security;
alter table api.practice_sessions force row level security;
alter table api.goals force row level security;
alter table api.notes force row level security;
