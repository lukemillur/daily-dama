import { describe, expect, it } from '@jest/globals';

import type {
  DomainSyncOutcome,
  FinishedSyncRun,
  SyncCoordinatorState,
} from '@/shared/sync/coordinator';

import { resolveFirstProfilePull } from './first-profile-pull';

const record = (outcome: DomainSyncOutcome) => ({ domain: 'profile' as const, outcome, settledAt: 1 });
const SUCCEEDED: DomainSyncOutcome = { status: 'succeeded' };
const FAILED: DomainSyncOutcome = { status: 'failed', errorMessage: 'offline' };

function running(generation: number, profile?: DomainSyncOutcome): SyncCoordinatorState {
  return {
    status: 'running',
    identityGeneration: generation,
    run: {
      runId: 'r',
      identityGeneration: generation,
      trigger: 'login',
      startedAt: 0,
      domainResults: profile ? { profile: record(profile) } : {},
      queuedRerunTrigger: undefined,
    },
  };
}

function idle(generation: number, lastRun?: Partial<FinishedSyncRun>): SyncCoordinatorState {
  return {
    status: 'idle',
    identityGeneration: generation,
    pendingRerunTrigger: undefined,
    lastRun: lastRun && {
      runId: 'r',
      identityGeneration: generation,
      trigger: 'login',
      startedAt: 0,
      endedAt: 1,
      outcome: 'completed',
      domainResults: {},
      ...lastRun,
    },
  };
}

const base = { identityKind: 'user', generation: 2, hasCompletedOnboardingLocally: false } as const;

describe('resolveFirstProfilePull', () => {
  it('does not apply to a guest', () => {
    expect(resolveFirstProfilePull({ ...base, identityKind: 'guest', coordinator: idle(2) })).toBe('not-applicable');
  });

  it('does not wait when the local profile already finished onboarding', () => {
    expect(
      resolveFirstProfilePull({ ...base, hasCompletedOnboardingLocally: true, coordinator: running(2) }),
    ).toBe('not-applicable');
  });

  it('is pending before any run exists', () => {
    expect(resolveFirstProfilePull({ ...base, coordinator: idle(2) })).toBe('pending');
  });

  it('is pending while a run has no profile result', () => {
    expect(resolveFirstProfilePull({ ...base, coordinator: running(2) })).toBe('pending');
  });

  it('settles when the running run has a successful profile result', () => {
    expect(resolveFirstProfilePull({ ...base, coordinator: running(2, SUCCEEDED) })).toBe('settled');
  });

  it('fails when the running run has a failed profile result', () => {
    expect(resolveFirstProfilePull({ ...base, coordinator: running(2, FAILED) })).toBe('failed');
  });

  it('reads the finished run once the coordinator is idle', () => {
    const run = (outcome: DomainSyncOutcome) => ({ domainResults: { profile: record(outcome) } });
    expect(resolveFirstProfilePull({ ...base, coordinator: idle(2, run(SUCCEEDED)) })).toBe('settled');
    expect(resolveFirstProfilePull({ ...base, coordinator: idle(2, run(FAILED)) })).toBe('failed');
  });

  it('ignores a finished run from an older identity generation', () => {
    const stale = idle(2, { identityGeneration: 1, domainResults: { profile: record(SUCCEEDED) } });
    expect(resolveFirstProfilePull({ ...base, coordinator: stale })).toBe('pending');
  });

  it('ignores a running run from another generation', () => {
    expect(resolveFirstProfilePull({ ...base, coordinator: running(1, SUCCEEDED) })).toBe('pending');
  });

  it('treats a cancelled run as no result', () => {
    const cancelled = idle(2, { outcome: 'cancelled', domainResults: { profile: record(SUCCEEDED) } });
    expect(resolveFirstProfilePull({ ...base, coordinator: cancelled })).toBe('pending');
  });

  it('returns to pending when a retry run starts after a failure', () => {
    const failed = idle(2, { domainResults: { profile: record(FAILED) } });
    expect(resolveFirstProfilePull({ ...base, coordinator: failed })).toBe('failed');
    expect(resolveFirstProfilePull({ ...base, coordinator: running(2) })).toBe('pending');
  });
});
