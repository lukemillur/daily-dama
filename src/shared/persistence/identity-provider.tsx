import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import { deriveIdentityFromAuthState } from '@/features/auth/model/identity-from-auth-state';
import { useAuthState } from '@/features/auth/state/auth-provider';
import { createIdentityContext, type IdentityContext } from '@/shared/persistence/identity-context';
import { GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';

/**
 * The single source of truth every identity-scoped domain provider reads from. Owns one
 * `IdentityContext` instance so all five domains switch namespaces together, in sync, off of
 * one Auth-derived identity -- no domain provider derives identity independently.
 */
export interface IdentityHandle {
  readonly identity: Identity;
  readonly generation: number;
  readonly context: IdentityContext;
}

// Exported so tests can drive `IdentityHandle` values directly (e.g. to exercise generation
// switches without going through Auth) without duplicating this context definition.
export const IdentityHandleContext = createContext<IdentityHandle | undefined>(undefined);

// Used only when a consumer isn't wrapped in <IdentityProvider> -- e.g. component/unit tests that
// mount a single domain provider directly and don't exercise identity switching at all. Always
// guest, generation 0, forever: this matches this app's pre-T156.2 behavior for those call sites.
// The real app (src/app/app/_layout.tsx) always wraps every domain provider in <IdentityProvider>
// and never hits this fallback.
const DEFAULT_HANDLE: IdentityHandle = {
  identity: GUEST_IDENTITY,
  generation: 0,
  context: createIdentityContext(),
};

export function IdentityProvider({ children }: PropsWithChildren) {
  const authState = useAuthState();
  const [context] = useState<IdentityContext>(() => createIdentityContext());

  const [handle, setHandle] = useState<IdentityHandle>(() => ({
    identity: context.getIdentity(),
    generation: context.getGeneration(),
    context,
  }));

  useEffect(() => {
    const nextIdentity = deriveIdentityFromAuthState(authState);
    if (nextIdentity === undefined) return; // still initializing; keep waiting

    const generation = context.setIdentity(nextIdentity);
    // Deferred to a microtask (matching auth-provider.tsx's own convention) so setState isn't
    // called synchronously within the effect body itself. `context`'s imperative generation
    // counter is already bumped above, which is what async load/write closures read for their
    // guard checks -- this deferral only delays the *reactive* re-render by a microtask.
    Promise.resolve().then(() => {
      setHandle((current) =>
        // `generation` only advances on a genuine identity change (see `IdentityContext.setIdentity`),
        // so an unchanged generation means an unchanged identity too -- bail out without producing a
        // new handle object, even though `nextIdentity` is a freshly-derived object each call (e.g.
        // repeated TOKEN_REFRESHED events for the same user must not cause consumers to re-render).
        current.generation === generation ? current : { identity: nextIdentity, generation, context },
      );
    });
  }, [authState, context]);

  // Never let a domain provider hydrate under a guessed identity: block rendering entirely
  // while Auth hasn't resolved yet, rather than defaulting to guest and possibly re-hydrating
  // a moment later under the real identity.
  if (authState.status === 'initializing') {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.wordmark}>Daily Dama</Text>
        <Text style={styles.message}>Loading your practice...</Text>
      </View>
    );
  }

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

export function useIdentityHandle(): IdentityHandle {
  return useContext(IdentityHandleContext) ?? DEFAULT_HANDLE;
}

const styles = StyleSheet.create({
  hydrationFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.yellow,
  },
  wordmark: {
    color: AppColors.ink,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  message: {
    color: AppColors.inkSoft,
    fontSize: 14,
    fontWeight: 700,
    marginTop: 8,
  },
});
