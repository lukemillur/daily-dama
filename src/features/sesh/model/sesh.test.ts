import { describe, expect, it } from '@jest/globals';

import {
  createTimedSeshPlan,
  formatRemainingDuration,
  INITIAL_SESH_STATE,
  OPEN_ENDED_SESH_PLAN,
  seshReducer,
  type SeshState,
} from '@/features/sesh/model/sesh';
import type { TrickSummary } from '@/features/tricks/model/trick';

const BIG_CUP: TrickSummary = {
  id: 'big-cup',
  name: 'Big cup',
  kenteiRank: 10,
  kenteiLevel: 'Basic',
  kenteiClass: '3rd Class',
};

function startSesh(plan = OPEN_ENDED_SESH_PLAN, startedAt = 1_000): SeshState {
  const countdown = seshReducer(INITIAL_SESH_STATE, {
    type: 'trickSelected',
    trick: BIG_CUP,
    plan,
  });
  return seshReducer(countdown, { type: 'countdownCompleted', now: startedAt });
}

describe('sesh reducer', () => {
  it('preserves the open-ended flow and records actual elapsed time', () => {
    const active = startSesh();
    const withLace = seshReducer(active, { type: 'trickLaced', now: 31_000 });
    const completed = seshReducer(withLace, { type: 'seshEnded', now: 91_000 });

    expect(completed).toEqual({
      status: 'completed',
      summary: {
        trick: BIG_CUP,
        plan: OPEN_ENDED_SESH_PLAN,
        startedAt: 1_000,
        endedAt: 91_000,
        durationMs: 90_000,
        landings: [{ landedAt: 31_000, elapsedMs: 30_000, intervalMs: 30_000 }],
      },
    });
  });

  it('ends a timed sesh early using actual practice time', () => {
    const plan = createTimedSeshPlan(5);
    const completed = seshReducer(startSesh(plan), { type: 'seshEnded', now: 121_000 });

    expect(completed).toMatchObject({
      status: 'completed',
      summary: {
        plan,
        startedAt: 1_000,
        endedAt: 121_000,
        durationMs: 120_000,
        landings: [],
      },
    });
  });

  it('automatically completes a timed sesh at its exact deadline with zero laces', () => {
    const plan = createTimedSeshPlan(1);
    const active = startSesh(plan);
    expect(seshReducer(active, { type: 'timerElapsed', now: 60_999 })).toBe(active);

    const completed = seshReducer(active, { type: 'timerElapsed', now: 61_000 });

    expect(completed).toMatchObject({
      status: 'completed',
      summary: {
        plan,
        startedAt: 1_000,
        endedAt: 61_000,
        durationMs: 60_000,
        landings: [],
      },
    });
  });

  it('ignores a lace at or after a timed sesh deadline', () => {
    const active = startSesh(createTimedSeshPlan(1));

    expect(seshReducer(active, { type: 'trickLaced', now: 61_000 })).toBe(active);
  });

  it('accepts only whole-minute timed plans from 1 through 60', () => {
    expect(createTimedSeshPlan(1)).toEqual({ kind: 'timed', durationMs: 60_000 });
    expect(createTimedSeshPlan(60)).toEqual({ kind: 'timed', durationMs: 3_600_000 });
    expect(() => createTimedSeshPlan(0)).toThrow(RangeError);
    expect(() => createTimedSeshPlan(1.5)).toThrow(RangeError);
    expect(() => createTimedSeshPlan(61)).toThrow(RangeError);
  });

  it('does not display zero before a countdown has actually finished', () => {
    expect(formatRemainingDuration(60_000)).toBe('01:00');
    expect(formatRemainingDuration(59_001)).toBe('01:00');
    expect(formatRemainingDuration(59_000)).toBe('00:59');
    expect(formatRemainingDuration(1)).toBe('00:01');
    expect(formatRemainingDuration(0)).toBe('00:00');
  });
});
