-- T258: api.feedback's optional Email field let a submitter type a
-- malformed address, which the feedback_email_format CHECK / RLS WITH CHECK
-- (T217.1/T221) rejected with a raw PostgREST 42501 that
-- mapPostgrestError classified 'authorization' -- a validation problem
-- rendered as an opaque authorization failure. Rather than build
-- field-level validation for a free-text email field, the client no longer
-- sends one at all (feedback-screen.tsx/submit-feedback.ts drop it in this
-- same change); this migration makes email fully server-owned so a
-- signed-in submitter's account email is still recorded, without ever
-- trusting a client-supplied value.
--
-- This is the first trigger on api.feedback -- T217.1/T221 only used
-- role-scoped GRANT/RLS, no BEFORE trigger. It mirrors the shape
-- established in 20260822210000_protect_server_owned_timestamps_and_ownership.sql
-- for other server-owned columns: SECURITY INVOKER (the default, not
-- declared), language plpgsql, an explicit search_path = '' so every
-- non-builtin identifier must stay schema-qualified (auth.uid()/auth.jwt()
-- are already schema-qualified; pg_catalog builtins remain reachable
-- because pg_catalog is always implicitly searched first regardless of the
-- session search_path).
--
-- This is BEFORE INSERT only -- api.feedback has no UPDATE grant for any
-- role (T217.1/T221's own throws_ok 42501 assertions confirm this), so
-- there is nothing to enforce on update.
--
-- feedback_email_format/feedback_email_length (the table CHECK and both
-- policies' WITH CHECK clauses) are left in place as belt-and-suspenders,
-- but are no longer reachable through a client request: by the time those
-- checks run, email is always either null or a real, well-formed
-- JWT-derived address, because Postgres evaluates RLS WITH CHECK against
-- the row *after* BEFORE ROW triggers have run.
create function private.enforce_feedback_mutation_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.email := auth.jwt() ->> 'email';
  else
    new.email := null;
  end if;
  return new;
end;
$$;

create trigger feedback_enforce_mutation_invariants
before insert on api.feedback
for each row execute function private.enforce_feedback_mutation_invariants();
