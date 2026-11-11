import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';

import { type FirstProfilePullStatus, resolveFirstProfilePull } from '../model/first-profile-pull';

export interface FirstProfilePull {
  readonly status: FirstProfilePullStatus;
  readonly retry: () => void;
}

/** Binds the pure first-pull decision to the live identity, local profile and sync coordinator. */
export function useFirstProfilePull(): FirstProfilePull {
  const { identity, generation } = useIdentityHandle();
  const profile = useUserProfile();
  const { state, retry } = useSyncCoordinatorStatus();

  return {
    status: resolveFirstProfilePull({
      identityKind: identity.kind,
      generation,
      hasCompletedOnboardingLocally: profile.hasCompletedOnboarding && profile.kenteiRank !== undefined,
      coordinator: state,
    }),
    retry,
  };
}
