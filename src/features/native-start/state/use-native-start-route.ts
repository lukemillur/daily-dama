import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuthState } from '@/features/auth/state/auth-provider';

import { type NativeStartDecision, resolveNativeStartDecision } from '../model/resolve-native-start-route';
import { useNativeOnboardingStatus } from './use-native-onboarding-status';

/** Resolves the native root-route decision and performs the Home redirect for returning users. */
export function useNativeStartRoute(): NativeStartDecision {
  const { status: authStatus } = useAuthState();
  const guestProfile = useNativeOnboardingStatus();
  const decision = resolveNativeStartDecision({ authStatus, guestProfile });
  const router = useRouter();

  useEffect(() => {
    if (decision === 'redirect-home') router.replace('/app/home');
  }, [decision, router]);

  return decision;
}
