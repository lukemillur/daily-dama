import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AccessGateScreen } from '@/features/access-gate/components/access-gate-screen';
import { getConfiguredAccessPassword, isCorrectAccessPassword } from '@/features/access-gate/model/access-gate';
import { loadAccessGateUnlocked, saveAccessGateUnlocked } from '@/features/access-gate/persistence/access-gate-persistence';
import { createWriteQueue } from '@/shared/persistence/storage';

interface AccessGateActions {
  readonly attemptUnlock: (passwordAttempt: string) => boolean;
}

const AccessGateActionsContext = createContext<AccessGateActions | undefined>(undefined);

export function AccessGateProvider({ children }: PropsWithChildren) {
  const configuredPassword = getConfiguredAccessPassword();
  // The gate is skipped entirely in local development so it doesn't get in
  // the way of iterating; production/preview builds are unaffected.
  const isGateActive = !__DEV__ && configuredPassword !== undefined;
  const [isUnlocked, setIsUnlocked] = useState(!isGateActive);
  const [hasHydrated, setHasHydrated] = useState(!isGateActive);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (unlocked: boolean) => {
      const result = await saveAccessGateUnlocked(AsyncStorage, unlocked);
      if (result.status === 'failed') {
        console.warn('Unable to persist the access gate state.', result.error);
      }
    }),
  );

  useEffect(() => {
    if (!isGateActive) return;

    let isCurrent = true;

    loadAccessGateUnlocked(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore the access gate state. Requiring the password again.', result.error);
      }

      setIsUnlocked(result.value);
      setHasHydrated(true);
    });

    return () => {
      isCurrent = false;
    };
  }, [isGateActive]);

  useEffect(() => {
    if (!hasHydrated || !isGateActive) return;

    if (shouldSkipInitialWrite.current) {
      shouldSkipInitialWrite.current = false;
      return;
    }

    void enqueueWrite(isUnlocked);
  }, [enqueueWrite, hasHydrated, isGateActive, isUnlocked]);

  const attemptUnlock = useCallback(
    (passwordAttempt: string) => {
      if (!isGateActive || configuredPassword === undefined) return true;
      if (!isCorrectAccessPassword(passwordAttempt, configuredPassword)) return false;

      setIsUnlocked(true);
      return true;
    },
    [configuredPassword, isGateActive],
  );

  const actions = useMemo(() => ({ attemptUnlock }), [attemptUnlock]);

  if (!hasHydrated) return null;

  if (!isUnlocked) {
    return (
      <AccessGateActionsContext.Provider value={actions}>
        <AccessGateScreen />
      </AccessGateActionsContext.Provider>
    );
  }

  return (
    <AccessGateActionsContext.Provider value={actions}>{children}</AccessGateActionsContext.Provider>
  );
}

export function useAccessGateActions() {
  const actions = useContext(AccessGateActionsContext);

  if (!actions) {
    throw new Error('useAccessGateActions must be used within AccessGateProvider.');
  }

  return actions;
}
