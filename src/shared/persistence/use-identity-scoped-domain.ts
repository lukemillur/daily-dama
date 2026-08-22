import { type Dispatch, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import {
  createWriteQueue,
  type KeyValueStorage,
  type PersistenceLoadResult,
  type PersistenceSaveResult,
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
  const shouldSkipNextWrite = useRef(true);

  const hasHydrated = hydratedGeneration === generation;

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
      createWriteQueue(async ({ value, taggedGeneration }: TaggedWrite<State>) => {
        // Cheap early bail-out for the common case: this write's turn arrived only after it was
        // already superseded (e.g. it was queued behind older items). Not sufficient on its own --
        // `optionsRef.current.save` is caller-supplied and may itself take arbitrary time (slow
        // AsyncStorage I/O, or other work) before it actually calls `setItem`, so the identity can
        // still flip *during* `save`. The authoritative guard is inside `guardedStorage.setItem`
        // below, which re-checks synchronously the instant `setItem` is actually invoked -- closing
        // the race regardless of how long `save` took to get there.
        if (!context.isCurrentGeneration(taggedGeneration)) return;

        const storage = createGuestMigratingStorage(AsyncStorage, context);
        const guardedStorage: KeyValueStorage = {
          getItem: storage.getItem,
          setItem: (key, itemValue) => {
            if (!context.isCurrentGeneration(taggedGeneration)) return Promise.resolve();
            return storage.setItem(key, itemValue);
          },
        };

        const result = await optionsRef.current.save(guardedStorage, value);
        if (result.status === 'failed') {
          optionsRef.current.onSaveFailed?.(result.error);
        }
      }),
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

  return { state, dispatch, hasHydrated };
}
