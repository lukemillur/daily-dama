import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, Spacing } from '@/constants/theme';
import { deriveIdentityFromAuthState } from '@/features/auth/model/identity-from-auth-state';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';
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

  if (authState.status === 'refreshFailed') {
    return <RefreshFailedRecovery />;
  }

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

/**
 * Recovery screen for a genuine refresh failure with no usable cached session (T262). This is
 * the one visible case per the ticket's owner-approved direction -- destructive/identity-changing
 * transitions must fail closed, so this stays up until "Try again" reloads the page or
 * "Continue as guest" durably succeeds.
 */
function RefreshFailedRecovery() {
  const { abandonAuthAndContinueAsGuest } = useAuthActions();
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | undefined>(undefined);

  const handleTryAgain = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const handleContinueAsGuest = useCallback(async () => {
    setIsContinuing(true);
    setContinueError(undefined);
    try {
      const { error } = await abandonAuthAndContinueAsGuest();
      if (error) {
        setContinueError('Could not continue as guest. Check your connection and try again.');
      }
    } finally {
      setIsContinuing(false);
    }
  }, [abandonAuthAndContinueAsGuest]);

  return (
    <View style={styles.recoveryContainer} accessibilityRole="alert">
      <Text style={styles.wordmark}>Daily Dama</Text>
      <Text accessibilityRole="header" style={styles.recoveryHeading}>
        We couldn&apos;t confirm your sign-in
      </Text>
      <Text style={styles.recoveryBody}>
        Your practice data already saved on this device is safe. We just couldn&apos;t reach the
        server to confirm your sign-in right now.
      </Text>
      {continueError ? (
        <Text
          style={styles.recoveryError}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {continueError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={handleTryAgain}
        style={({ pressed }) => [styles.recoveryButton, pressed && styles.recoveryButtonPressed]}
      >
        <Text style={styles.recoveryButtonText}>Try again</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isContinuing}
        accessibilityState={{ disabled: isContinuing, busy: isContinuing }}
        onPress={() => {
          void handleContinueAsGuest();
        }}
        style={({ pressed }) => [
          styles.recoveryButton,
          styles.recoverySecondaryButton,
          pressed && styles.recoveryButtonPressed,
        ]}
      >
        <Text style={styles.recoveryButtonText}>
          {isContinuing ? 'Continuing...' : 'Continue as guest'}
        </Text>
      </Pressable>
    </View>
  );
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
  recoveryContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.yellow,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  recoveryHeading: {
    color: AppColors.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  recoveryBody: {
    color: AppColors.inkSoft,
    fontSize: 14,
    textAlign: 'center',
  },
  recoveryError: {
    color: AppColors.red,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  recoveryButton: {
    borderWidth: 1,
    borderColor: AppColors.ink,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  recoverySecondaryButton: {
    borderColor: AppColors.inkSoft,
  },
  recoveryButtonPressed: {
    opacity: 0.7,
  },
  recoveryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.ink,
  },
});
