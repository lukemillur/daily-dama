import type { SyncCoordinatorState } from '@/shared/sync/coordinator';

export type FirstProfilePullStatus = 'not-applicable' | 'pending' | 'settled' | 'failed';

export interface FirstProfilePullInputs {
  readonly identityKind: 'guest' | 'user';
  /** Current identity generation; results from any other generation are stale. */
  readonly generation: number;
  /** Local profile already finished onboarding (flag and rank). */
  readonly hasCompletedOnboardingLocally: boolean;
  readonly coordinator: SyncCoordinatorState;
}

/**
 * Whether the onboarding decision must wait on the signed-in identity's first profile pull.
 *
 * Fail closed: until the coordinator reports a profile result for the current generation the
 * answer is `pending`, never `settled`. A device whose cached profile already finished
 * onboarding does not wait, so an offline relaunch still reaches Home.
 */
export function resolveFirstProfilePull({
  identityKind,
  generation,
  hasCompletedOnboardingLocally,
  coordinator,
}: FirstProfilePullInputs): FirstProfilePullStatus {
  if (identityKind !== 'user' || hasCompletedOnboardingLocally) return 'not-applicable';

  const record =
    coordinator.status === 'running'
      ? coordinator.run.identityGeneration === generation
        ? coordinator.run.domainResults.profile
        : undefined
      : coordinator.lastRun?.identityGeneration === generation &&
          coordinator.lastRun.outcome === 'completed'
        ? coordinator.lastRun.domainResults.profile
        : undefined;

  if (record === undefined) return 'pending';
  return record.outcome.status === 'succeeded' ? 'settled' : 'failed';
}
