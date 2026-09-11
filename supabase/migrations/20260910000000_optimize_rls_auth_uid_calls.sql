-- Wrap auth.uid() in a scalar subquery in every RLS policy so Postgres
-- evaluates it once per query (an initplan) instead of once per row
-- scanned. This is Supabase's documented RLS performance fix
-- (auth_rls_initplan) and changes no access behavior: each policy's
-- condition is unchanged, only how often auth.uid() is invoked.

alter policy custom_tricks_own_row on api.custom_tricks
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy goals_select_own on api.goals
  using (user_id = (select auth.uid()));

alter policy goals_insert_own on api.goals
  with check (user_id = (select auth.uid()));

alter policy goals_update_own on api.goals
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy notes_select_own on api.notes
  using (user_id = (select auth.uid()));

alter policy notes_insert_own on api.notes
  with check (user_id = (select auth.uid()));

alter policy notes_update_own on api.notes
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy practice_sessions_select_own on api.practice_sessions
  using (user_id = (select auth.uid()));

alter policy practice_sessions_insert_own on api.practice_sessions
  with check (user_id = (select auth.uid()));

alter policy profiles_select_own on api.profiles
  using (user_id = (select auth.uid()));

alter policy profiles_insert_own on api.profiles
  with check (user_id = (select auth.uid()));

alter policy profiles_update_own on api.profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy user_trick_states_own_row on api.user_trick_states
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Notes are looked up per practice session (T157-era session-note linking);
-- this composite index lets both the RLS user_id predicate and a
-- session-scoped lookup use one index instead of a filter-then-scan.
create index if not exists notes_user_practice_session_idx
  on api.notes (user_id, practice_session_id);
