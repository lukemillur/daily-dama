-- Fix T221: signed-in users could not submit feedback in production.
--
-- 20260902000000_add_feedback_table_with_anon_insert.sql granted INSERT on
-- api.feedback to `anon` only, on the assumption (stated in
-- submit-feedback.ts's header comment) that anonymous visitors and signed-in
-- users both submit through the same anon-key path. That assumption doesn't
-- hold: src/shared/supabase/supabase-client.ts's client has
-- `persistSession: true`, so supabase-js attaches the signed-in user's own
-- JWT (`Authorization: Bearer <session token>`) to every request once a
-- session exists, and PostgREST evaluates that request as role
-- `authenticated`, not `anon`. With no grant and no policy for
-- `authenticated`, every logged-in feedback submission failed with
-- PostgREST error 42501 "permission denied for table feedback".
--
-- This grants `authenticated` the same INSERT-only capability as `anon`,
-- gated by an identical WITH CHECK (redundant with the table's own CHECK
-- constraints, matching the original migration's belt-and-suspenders
-- pattern). No SELECT/UPDATE/DELETE grant is added for either role.

grant insert on api.feedback to authenticated;

create policy feedback_insert_authenticated on api.feedback
  for insert
  to authenticated
  with check (
    length(btrim(message)) > 0
    and length(message) <= 2000
    and (name is null or length(name) <= 100)
    and (email is null or length(email) <= 254)
    and (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$')
  );
