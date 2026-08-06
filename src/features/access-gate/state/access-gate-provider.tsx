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
  const [isUnlocked, setIsUnlocked] = useState(configuredPassword === undefined);
  const [hasHydrated, setHasHydrated] = useState(configuredPassword === undefined);
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
    if (configuredPassword === undefined) return;

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
    // Only the presence of a configured password should re-run hydration, not its value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredPassword !== undefined]);

  useEffect(() => {
    if (!hasHydrated || configuredPassword === undefined) return;

    if (shouldSkipInitialWrite.current) {
      shouldSkipInitialWrite.current = false;
      return;
    }

    void enqueueWrite(isUnlocked);
  }, [configuredPassword, enqueueWrite, hasHydrated, isUnlocked]);

  const attemptUnlock = useCallback(
    (passwordAttempt: string) => {
      if (configuredPassword === undefined) return true;
      if (!isCorrectAccessPassword(passwordAttempt, configuredPassword)) return false;

      setIsUnlocked(true);
      return true;
    },
    [configuredPassword],
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
