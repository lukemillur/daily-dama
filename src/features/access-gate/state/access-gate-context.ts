import { createContext, useContext } from 'react';

interface AccessGateActions {
  readonly attemptUnlock: (passwordAttempt: string) => boolean;
}

export const AccessGateActionsContext = createContext<AccessGateActions | undefined>(undefined);

export function useAccessGateActions() {
  const actions = useContext(AccessGateActionsContext);

  if (!actions) {
    throw new Error('useAccessGateActions must be used within AccessGateProvider.');
  }

  return actions;
}
