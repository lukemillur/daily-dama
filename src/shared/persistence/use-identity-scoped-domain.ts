import { type Dispatch, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import {
  createWriteQueue,
  type KeyValueStorage,
  type LocalDurabilityStatus,
  type PersistenceLoadResult,
  type PersistenceSaveResult,
  type ScopedSaveOutcome,
} from '@/shared/persistence/storage';

export interface UseIdentityScopedDomainOptions<State, Action> {
  readonly reducer: (state: State, action: Action) => State;
  readonly initialState: State;
  readonly load: (storage: KeyValueStorage) => Promise<PersistenceLoadResult<State>>;
  readonly save: (storage: KeyValueStorage, value: State) => Promise<PersistenceSaveResult>;
  readonly createRestoreAction: (value: State) => Action;
  readonly onRecovered?: (error: unknown) => void;
  readonly onSaveFailed?: (error: unknown) => void;
}

export interface UseIdentityScopedDomainResult<State, Action> {
  readonly state: State;
  readonly dispatch: Dispatch<Action>;
  readonly hasHydrated: boolean;
  // Runtime-only local-durability status for this domain's primary persisted
  // state (see `LocalDurabilityStatus`'s doc comment). Set exclusively from
  // inside the write queue's worker below -- never from an external `.then()`
  // on `enqueueWrite`'s returned promise -- so its ordering guarantee falls
  // out of the queue's existing strict serialization rather than needing
  // separate sequence-number bookkeeping. An identity switch resets this to
  // `{ status: 'saved' }` synchronously in the hydration effect, before the
  // new generation's load even resolves, so a prior identity's failure can
  // never leak into the new namespace.
  readonly durability: LocalDurabilityStatus<State>;
  // Thin wrapper around the same internal enqueueWrite queue the
  // hydration/write effect below already uses -- an explicit imperative
  // save for a caller (T158's discard-pending-outbox flow) that needs to
  // know whether a specific write was durably written, failed, or was
  // superseded by an identity change before proceeding (e.g. to signOut()),
  // without opening a second, independent write path that could race the
  // effect-driven writer for the same storage key. This never rejects: a
  // thrown `save` resolves as `{ status: "failed", error }` instead, so
  // callers only ever have to branch on the resolved outcome.
  readonly saveNow: (value: State) => Promise<ScopedSaveOutcome>;
}

interface TaggedWrite<State> {
  readonly value: State;
  readonly taggedGeneration: number;
}

/**
 * Shared mechanics behind every identity-scoped domain provider (profile, custom tricks, practice
 * history, goals, notes): one implementation of the hydration/generation/write-queue dance instead
 * of five hand-copies that can drift.
 *
 * - Re-hydrates whenever the current identity's generation changes (sign-in, sign-out, switching
 *   accounts), not just once at mount -- `hasHydrated` means "hydrated for the current generation".
 * - A load started for a since-superseded generation never gets applied (`withGenerationGuard`
 *   semantics, inlined here against `hydratedGeneration`).
 * - A write queued for a since-superseded generation self-discards immediately before it would
 *   touch storage, instead of landing in the wrong (now-current) namespace.
 * - A single shared write queue lives for the whole domain's lifetime -- ordering only needs to
 *   hold within an identity's own write history, so the queue is never forked per identity.
 * - `durability` retains the latest snapshot from a failed effect-driven write and exposes a
 *   `retry()` that replays it through the same queue. Because the queue's writes execute strictly
 *   serially (each write's worker only starts after the previous one has fully resolved),
 *   `durability` is safe to set from directly inside the worker without any extra sequence-number
 *   bookkeeping -- a later write's outcome can never be overwritten by an earlier, slower write's
 *   outcome resolving out of order, because there is no "out of order" to begin with.
 *
 * `options` is a fresh object literal every render (each provider passes inline `createRestoreAction`
 * /`onRecovered`/`onSaveFailed` closures), so it's stashed in a ref rather than depended on directly
 * -- putting it in the effect dependency arrays would re-fire hydration on every render, not just on
 * an actual identity switch. (React Compiler would normally keep such inline callbacks referentially
 * stable across renders, but Jest's transform doesn't run the compiler pass, so relying on that for
 * correctness broke under test -- confirmed by an infinite hydration loop when this was tried.) The
 * ref itself is synced in a layout effect, never written during render, to stay render-pure.
 */
export function useIdentityScopedDomain<State, Action>(
  options: UseIdentityScopedDomainOptions<State, Action>,
): UseIdentityScopedDomainResult<State, Action> {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const { context, generation } = useIdentityHandle();
  const [state, dispatch] = useReducer(options.reducer, options.initialState);
  const [hydratedGeneration, setHydratedGeneration] = useState<number | undefined>(undefined);
  const [durability, setDurability] = useState<LocalDurabilityStatus<State>>({ status: 'saved' });
  const shouldSkipNextWrite = useRef(true);

  const hasHydrated = hydratedGeneration === generation;

  // Clears any prior generation's failed durability status the instant an identity switch is
  // observed during render -- independent of whether this generation's load succeeds, and without
  // waiting for an effect to run -- so a stale failure can never leak across namespaces. This is
  // React's "adjust state during rendering" pattern rather than an effect: it compares against the
  // last generation this component actually rendered `durability` for, and both updates land in the
  // same render pass, so it never needlessly loops.
  const [durabilityGeneration, setDurabilityGeneration] = useState(generation);
  if (durabilityGeneration !== generation) {
    setDurabilityGeneration(generation);
    setDurability({ status: 'saved' });
  }

  useEffect(() => {
    let cancelled = false;
    const capturedGeneration = context.getGeneration();
    const storage = createGuestMigratingStorage(AsyncStorage, context);

    optionsRef.current.load(storage).then((result) => {
      if (cancelled) return;
      if (!context.isCurrentGeneration(capturedGeneration)) return; // superseded; discard

      if (result.status === 'recovered') {
        optionsRef.current.onRecovered?.(result.error);
      }

      // Restoring for a (possibly new) generation must not be persisted straight back out as
      // though it were a user-driven change -- this is the direct generalization of "skip the
      // first write", re-armed per generation rather than only at first-ever mount.
      shouldSkipNextWrite.current = true;
      dispatch(optionsRef.current.createRestoreAction(result.value));
      setHydratedGeneration(capturedGeneration);
    });

    return () => {
      cancelled = true;
    };
  }, [context, generation]);

  // `optionsRef.current` below is only ever read inside the async callback's body, which
  // `createWriteQueue` invokes later (never synchronously during this render); the lint can't prove
  // that statically and flags the mere closure capture as a ref read during render. See the
  // `useIdentityScopedDomain` doc comment above for why a ref is used here instead of depending on
  // caller-side memoization.
  /* eslint-disable react-hooks/refs */
  const enqueueWrite = useMemo(
    () =>
      createWriteQueue<TaggedWrite<State>, ScopedSaveOutcome>(
        async ({ value, taggedGeneration }: TaggedWrite<State>) => {
          // Cheap early bail-out for the common case: this write's turn arrived only after it was
          // already superseded (e.g. it was queued behind older items). Not sufficient on its own --
          // `optionsRef.current.save` is caller-supplied and may itself take arbitrary time (slow
          // AsyncStorage I/O, or other work) before it actually calls `setItem`, so the identity can
          // still flip *during* `save`. The authoritative guard is inside `guardedStorage.setItem`
          // below, which re-checks synchronously the instant `setItem` is actually invoked -- closing
          // the race regardless of how long `save` took to get there.
          if (!context.isCurrentGeneration(taggedGeneration)) return { status: 'superseded' };

          let supersededDuringWrite = false;
          const storage = createGuestMigratingStorage(AsyncStorage, context);
          const guardedStorage: KeyValueStorage = {
            getItem: storage.getItem,
            setItem: (key, itemValue) => {
              if (!context.isCurrentGeneration(taggedGeneration)) {
                supersededDuringWrite = true;
                return Promise.resolve();
              }
              return storage.setItem(key, itemValue);
            },
          };

          try {
            const result = await optionsRef.current.save(guardedStorage, value);

            // A generation flip during `save` is reported as superseded regardless of the
            // underlying result: the disk write (if it happened) landed in the correct, now-stale
            // namespace, so there is no replay risk, but the caller must not act on this outcome
            // (e.g. dispatch into a now-rehydrating reducer, or advance a logout flow).
            if (supersededDuringWrite || !context.isCurrentGeneration(taggedGeneration)) {
              return { status: 'superseded' };
            }

            if (result.status === 'failed') {
              optionsRef.current.onSaveFailed?.(result.error);
              if (context.isCurrentGeneration(taggedGeneration)) {
                setDurability({
                  status: 'failed',
                  snapshot: value,
                  retry: () =>
                    enqueueWrite({ value, taggedGeneration: context.getGeneration() }),
                });
              }
              return { status: 'failed', error: result.error };
            }

            // A functional update that returns the same reference when durability is already
            // `saved` lets React bail out of the re-render entirely (`Object.is` equality) instead
            // of scheduling one for every routine successful write -- most writes never transition
            // out of `saved`, and without this a background write settling well after a test's
            // `act()` block (or any effect-driven write in the running app) would otherwise trigger
            // a state update on every single successful save.
            if (context.isCurrentGeneration(taggedGeneration)) {
              setDurability((previous) => (previous.status === 'saved' ? previous : { status: 'saved' }));
            }
            return { status: 'saved' };
          } catch (error) {
            if (supersededDuringWrite || !context.isCurrentGeneration(taggedGeneration)) {
              return { status: 'superseded' };
            }
            optionsRef.current.onSaveFailed?.(error);
            if (context.isCurrentGeneration(taggedGeneration)) {
              setDurability({
                status: 'failed',
                snapshot: value,
                retry: () =>
                  enqueueWrite({ value, taggedGeneration: context.getGeneration() }),
              });
            }
            return { status: 'failed', error };
          }
        },
      ),
    [context],
  );
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    if (!hasHydrated) return;

    if (shouldSkipNextWrite.current) {
      shouldSkipNextWrite.current = false;
      return;
    }

    const taggedGeneration = context.getGeneration();
    void enqueueWrite({ value: state, taggedGeneration });
  }, [state, hasHydrated, context, enqueueWrite]);

  const saveNow = useCallback(
    (value: State) => {
      const taggedGeneration = context.getGeneration();
      return enqueueWrite({ value, taggedGeneration });
    },
    [context, enqueueWrite],
  );

  return { state, dispatch, hasHydrated, durability, saveNow };
}
