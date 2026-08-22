-- Establish the exposed/private schema boundary and deny-by-default privileges
-- (T155.1). This migration creates no application tables; it only fixes the
-- privilege surface so that future objects are unreachable until a later
-- migration grants access explicitly and deliberately.
--
-- Baseline this corrects: Supabase's own bootstrap (run as `postgres` and
-- `supabase_admin`) installs `ALTER DEFAULT PRIVILEGES` entries on the
-- built-in `public` schema that auto-grant full CRUD on future tables and
-- USAGE on future sequences to `anon`/`authenticated`/`service_role`. Any
-- table created in `public` by a migration (which runs as `postgres`) would
-- silently inherit anonymous read/write access. This migration neutralizes
-- that default and moves the actual API surface to a schema Supabase never
-- auto-configures this way.

-- 1. Create the two application schemas.
--    `api`     - the only schema exposed to PostgREST (see supabase/config.toml).
--    `private` - never listed in config.toml's [api] schemas, so PostgREST
--                cannot route to it regardless of any grant below. Intended
--                for SECURITY DEFINER helper functions and internal-only
--                objects that must remain reachable solely via `api` wrappers
--                or direct database access (migrations, service_role).
create schema if not exists api;
create schema if not exists private;

comment on schema api is
  'Exposed Data API schema (see supabase/config.toml [api].schemas). Only objects granted here are reachable by anon/authenticated over the Data API.';
comment on schema private is
  'Never exposed via the Data API. Holds internal helpers; reachable only via SECURITY DEFINER wrappers in api or direct database access.';

-- 2. Revoke the automatic default privileges Supabase's bootstrap installed
--    "for role postgres" on `public` (migrations run as `postgres`, so this
--    is the entry that would otherwise auto-grant anon/authenticated full
--    CRUD on any table our own migrations create in `public`). A matching
--    "for role supabase_admin" entry also exists from the same bootstrap,
--    but `postgres` has no membership in `supabase_admin` and cannot alter
--    it; that is fine because application migrations never run as
--    `supabase_admin`, so it can never fire for objects we create. (`public`
--    itself is intentionally left out of [api].schemas as well, so this is
--    defense in depth against anything ever being created there.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- 3. Strip `anon`/`authenticated`'s standing access to `public`. Two
--    separate grants currently give them this: an ambient PUBLIC
--    pseudo-role grant, and a direct GRANT USAGE Supabase's bootstrap makes
--    (owned by `pg_database_owner`, which `postgres` inherits as the
--    database owner). Both must be revoked; revoking only one leaves the
--    other in place. `service_role` keeps USAGE on `public` since Supabase's
--    own internal tooling relies on it and it already bypasses RLS.
revoke all on schema public from public;
revoke usage on schema public from anon, authenticated;

-- 4. Lock down the two application schemas by default: nobody but the
--    owning/administrative roles gets schema-level access, and no future
--    object in either schema is auto-granted to anon/authenticated. Each
--    later ticket that adds real tables/functions (T155.2-T155.7) must grant
--    access explicitly and per-object; nothing here is a standing exception.
revoke all on schema api from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

alter default privileges in schema api
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema api
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema api
  revoke all on functions from public, anon, authenticated;

alter default privileges in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema private
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private
  revoke all on functions from public, anon, authenticated;

-- 5. `authenticated` may enter the exposed schema itself (a prerequisite for
--    any future per-table GRANT to work at all); `anon` gets nothing here or
--    anywhere else, by deliberate policy of this prototype's threat model
--    (no publicly readable application resource is planned). `private` is
--    reachable only by `service_role`/`postgres` (for SECURITY DEFINER
--    helpers called from `api` wrappers); `authenticated`/`anon` never get
--    schema-level access to it.
grant usage on schema api to authenticated, service_role;
grant usage on schema private to service_role;
