import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import {
  type CachedOnboardingStatus,
  readCachedOnboardingStatus,
} from '@/features/profile/persistence/read-cached-onboarding-status';
import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);
const UNONBOARDED: CachedOnboardingStatus = { hasCompletedOnboarding: false, kenteiRank: undefined };

/**
 * One AsyncStorage read of the guest profile. Returns `undefined` until it resolves so the
 * caller can tell "not read yet" from "not onboarded"; a failed read resolves to not onboarded
 * rather than leaving the root route blank forever.
 */
export function useNativeOnboardingStatus(): CachedOnboardingStatus | undefined {
  const [status, setStatus] = useState<CachedOnboardingStatus | undefined>(undefined);

  useEffect(() => {
    let isCurrent = true;
    AsyncStorage.getItem(GUEST_SCOPED_KEY).then(
      (serialized) => {
        if (isCurrent) setStatus(readCachedOnboardingStatus(() => serialized));
      },
      () => {
        if (isCurrent) setStatus(UNONBOARDED);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  return status;
}
