-- T157.7: goal synchronization needs local goal editing (changing a goal's
-- numeric target in place) to push as a real UPDATE. The prior migration
-- (20260822210000_protect_server_owned_timestamps_and_ownership.sql) only
-- ever granted UPDATE on api.goals' deleted_at column, and its own comment
-- explicitly deferred extending this grant to this task. trick_id/
-- trick_name/kind stay off the grant -- a goal's trick and kind are fixed
-- at creation, never legitimately editable in place.
--
-- No trigger change: private.enforce_goal_note_mutation_invariants already
-- accepts any UPDATE on a non-tombstoned row and forces
-- revision/updated_at/created_at/user_id/id server-side, and unconditionally
-- rejects any UPDATE against an already-tombstoned row (23514) regardless of
-- which columns the client's WHERE clause or SET list touched. That
-- behavior is unchanged and is exactly what T157.7's sync adapter relies on
-- for its tombstone-vs-genuine-conflict disambiguation.

revoke update on api.goals from authenticated;

grant update (
  deleted_at, target_count, target_ms
) on api.goals to authenticated;
