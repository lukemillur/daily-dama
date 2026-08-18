import { describe, expect, it } from '@jest/globals';

import {
  createOpenEndedSeshPlan,
  createTimedSeshPlan,
  formatRemainingDuration,
  getSeshTargetLandingCount,
  INITIAL_SESH_STATE,
  isSeshTargetMet,
  type Landing,
  OPEN_ENDED_SESH_PLAN,
  selectSeshPracticeTricks,
  seshReducer,
  type SeshSummary,
  shouldKeepScreenAwake,
  shouldPromptSeshNote,
  type SeshState,
} from '@/features/sesh/model/sesh';
import type { PracticeTrick, TrickSummary } from '@/features/tricks/model/trick';

const BIG_CUP: TrickSummary = {
  id: 'big-cup',
  name: 'Big cup',
  kenteiRank: 10,
  kenteiLevel: 'Basic',
  kenteiClass: '3rd Class',
};

const CUSTOM_SEQUENCE: PracticeTrick = {
  id: 'custom-sequence',
  name: 'Sunrise line',
  descriptor: 'Custom sequence',
  sequenceSteps: ['Big cup', 'Nightmare turn', 'Spike'],
};

const AIRPLANE: PracticeTrick = { id: 'airplane', name: 'Airplane' };

function startSesh(
  plan = OPEN_ENDED_SESH_PLAN,
  startedAt = 1_000,
  trick: PracticeTrick = BIG_CUP,
): SeshState {
  const countdown = seshReducer(INITIAL_SESH_STATE, {
    type: 'trickSelected',
    trick,
    plan,
  });
  return seshReducer(countdown, { type: 'countdownCompleted', now: startedAt });
}

describe('sesh reducer', () => {
  it('starts a custom trick in both open-ended and timed modes', () => {
    expect(startSesh(OPEN_ENDED_SESH_PLAN, 1_000, CUSTOM_SEQUENCE)).toMatchObject({
      status: 'active',
      trick: CUSTOM_SEQUENCE,
      plan: OPEN_ENDED_SESH_PLAN,
    });
    expect(startSesh(createTimedSeshPlan(5), 1_000, CUSTOM_SEQUENCE)).toMatchObject({
      status: 'active',
      trick: CUSTOM_SEQUENCE,
      plan: { kind: 'timed', durationMs: 300_000 },
    });
  });

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

  it('excludes paused time from elapsed and pace, and extends a timed deadline', () => {
    const plan = createTimedSeshPlan(1);
    const active = startSesh(plan);
    const paused = seshReducer(active, { type: 'seshPaused', now: 10_000 });
    expect(paused).toMatchObject({ status: 'active', pausedAt: 10_000, pausedDurationMs: 0 });

    // The timer would have elapsed at 61_000 if not paused; while paused it must not complete.
    expect(seshReducer(paused, { type: 'timerElapsed', now: 61_000 })).toBe(paused);
    // Laces are ignored while paused.
    expect(seshReducer(paused, { type: 'trickLaced', now: 15_000 })).toBe(paused);

    const resumed = seshReducer(paused, { type: 'seshResumed', now: 40_000 });
    expect(resumed).toMatchObject({ status: 'active', pausedAt: undefined, pausedDurationMs: 30_000 });

    // Original deadline (61_000) has passed, but the 30s pause pushes it to 91_000.
    expect(seshReducer(resumed, { type: 'timerElapsed', now: 61_000 })).toBe(resumed);

    const withLace = seshReducer(resumed, { type: 'trickLaced', now: 51_000 });
    expect(withLace).toMatchObject({
      landings: [{ landedAt: 51_000, elapsedMs: 20_000, intervalMs: 20_000 }],
    });

    const completed = seshReducer(withLace, { type: 'timerElapsed', now: 91_000 });
    expect(completed).toMatchObject({
      status: 'completed',
      summary: { startedAt: 1_000, endedAt: 91_000, durationMs: 60_000 },
    });
  });

  it('accounts for an in-progress pause when a sesh is ended while paused', () => {
    const active = startSesh(OPEN_ENDED_SESH_PLAN, 1_000);
    const paused = seshReducer(active, { type: 'seshPaused', now: 20_000 });

    const completed = seshReducer(paused, { type: 'seshEnded', now: 25_000 });

    expect(completed).toMatchObject({
      status: 'completed',
      summary: { startedAt: 1_000, endedAt: 25_000, durationMs: 19_000 },
    });
  });

  it('lets a Repeat sesh restart directly from a completed state', () => {
    const plan = createTimedSeshPlan(1);
    const completed = seshReducer(startSesh(plan), { type: 'seshEnded', now: 30_000 });

    const repeated = seshReducer(completed, { type: 'trickSelected', trick: BIG_CUP, plan });

    expect(repeated).toEqual({ status: 'countdown', trick: BIG_CUP, plan });
  });

  it('accepts only whole-minute timed plans from 1 through 60', () => {
    expect(createTimedSeshPlan(1)).toEqual({ kind: 'timed', durationMs: 60_000 });
    expect(createTimedSeshPlan(60)).toEqual({ kind: 'timed', durationMs: 3_600_000 });
    expect(() => createTimedSeshPlan(0)).toThrow(RangeError);
    expect(() => createTimedSeshPlan(1.5)).toThrow(RangeError);
    expect(() => createTimedSeshPlan(61)).toThrow(RangeError);
  });

  it('accepts a whole-number open-ended target from 1 through 999', () => {
    expect(createOpenEndedSeshPlan(1)).toEqual({ kind: 'openEnded', target: { landingCount: 1 } });
    expect(createOpenEndedSeshPlan(999)).toEqual({ kind: 'openEnded', target: { landingCount: 999 } });
    expect(() => createOpenEndedSeshPlan(0)).toThrow(RangeError);
    expect(() => createOpenEndedSeshPlan(1.5)).toThrow(RangeError);
    expect(() => createOpenEndedSeshPlan(1000)).toThrow(RangeError);
  });

  it('omits the target entirely when none is given, matching the untargeted default', () => {
    expect(createOpenEndedSeshPlan()).toEqual(OPEN_ENDED_SESH_PLAN);
    expect(createOpenEndedSeshPlan()).toEqual({ kind: 'openEnded' });
  });

  it('stores a defined open-ended target on the sesh initial state once active', () => {
    const targeted = createOpenEndedSeshPlan(10);
    const active = startSesh(targeted);

    expect(active).toMatchObject({ status: 'active', plan: { kind: 'openEnded', target: { landingCount: 10 } } });
  });

  it('starting an open-ended sesh with no target behaves exactly as before', () => {
    const active = startSesh(OPEN_ENDED_SESH_PLAN);

    expect(active).toMatchObject({ status: 'active', plan: { kind: 'openEnded' } });
    expect((active as { plan: { target?: unknown } }).plan.target).toBeUndefined();
  });

  it('considers a timed plan\'s target always met, regardless of landing count', () => {
    const plan = createTimedSeshPlan(5);
    expect(getSeshTargetLandingCount(plan)).toBeUndefined();
    expect(isSeshTargetMet(plan, 0)).toBe(true);
    expect(isSeshTargetMet(plan, 100)).toBe(true);
  });

  it('considers an untargeted open-ended plan always met, regardless of landing count', () => {
    expect(getSeshTargetLandingCount(OPEN_ENDED_SESH_PLAN)).toBeUndefined();
    expect(isSeshTargetMet(OPEN_ENDED_SESH_PLAN, 0)).toBe(true);
    expect(isSeshTargetMet(OPEN_ENDED_SESH_PLAN, 100)).toBe(true);
  });

  it('gates a targeted open-ended plan on reaching the target landing count', () => {
    const plan = createOpenEndedSeshPlan(10);
    expect(getSeshTargetLandingCount(plan)).toBe(10);
    expect(isSeshTargetMet(plan, 0)).toBe(false);
    expect(isSeshTargetMet(plan, 9)).toBe(false);
    expect(isSeshTargetMet(plan, 10)).toBe(true);
    expect(isSeshTargetMet(plan, 11)).toBe(true);
  });

  it('does not display zero before a countdown has actually finished', () => {
    expect(formatRemainingDuration(60_000)).toBe('01:00');
    expect(formatRemainingDuration(59_001)).toBe('01:00');
    expect(formatRemainingDuration(59_000)).toBe('00:59');
    expect(formatRemainingDuration(1)).toBe('00:01');
    expect(formatRemainingDuration(0)).toBe('00:00');
  });

  it('clears directPracticeTrickId when seshReset is dispatched (T081)', () => {
    const directPracticeChoosing: SeshState = {
      status: 'choosing',
      directPracticeTrickId: 'big-cup',
    };
    expect(seshReducer(directPracticeChoosing, { type: 'seshReset' })).toEqual(
      INITIAL_SESH_STATE,
    );
  });

  it('still transitions to countdown from a direct-practice choosing state (T081)', () => {
    const directPracticeChoosing: SeshState = {
      status: 'choosing',
      directPracticeTrickId: 'big-cup',
    };
    const plan = OPEN_ENDED_SESH_PLAN;
    expect(
      seshReducer(directPracticeChoosing, { type: 'trickSelected', trick: BIG_CUP, plan }),
    ).toMatchObject({
      status: 'countdown',
      trick: BIG_CUP,
      plan,
    });
  });

  it('enters direct-practice choosing for a newly requested trick while already choosing', () => {
    expect(
      seshReducer(INITIAL_SESH_STATE, { type: 'directPracticeRequested', trickId: 'big-cup' }),
    ).toEqual({ status: 'choosing', directPracticeTrickId: 'big-cup' });

    const alreadyDirectPractice: SeshState = {
      status: 'choosing',
      directPracticeTrickId: 'big-cup',
    };
    expect(
      seshReducer(alreadyDirectPractice, {
        type: 'directPracticeRequested',
        trickId: 'lighthouse-flip',
      }),
    ).toEqual({ status: 'choosing', directPracticeTrickId: 'lighthouse-flip' });
  });

  it('ignores a direct-practice request while a sesh is already in progress', () => {
    const active: SeshState = {
      status: 'active',
      trick: BIG_CUP,
      plan: OPEN_ENDED_SESH_PLAN,
      startedAt: 0,
      landings: [],
      pausedDurationMs: 0,
    };
    expect(
      seshReducer(active, { type: 'directPracticeRequested', trickId: 'lighthouse-flip' }),
    ).toBe(active);
  });
});

describe('preferred Sesh trick', () => {
  const availableTricks = [BIG_CUP, AIRPLANE, CUSTOM_SEQUENCE];

  it('places a valid preferred trick first while retaining the selected rotation', () => {
    expect(
      selectSeshPracticeTricks(
        availableTricks,
        [BIG_CUP.id, CUSTOM_SEQUENCE.id],
        CUSTOM_SEQUENCE.id,
      ),
    ).toEqual([CUSTOM_SEQUENCE, BIG_CUP]);
  });

  it('allows an available historical trick to be practiced again when it is not selected', () => {
    expect(selectSeshPracticeTricks(availableTricks, [BIG_CUP.id], AIRPLANE.id)).toEqual([
      AIRPLANE,
      BIG_CUP,
    ]);
  });

  it('falls back to the normal selected picker for an invalid or stale trick id', () => {
    expect(selectSeshPracticeTricks(availableTricks, [BIG_CUP.id], 'custom-deleted')).toEqual([
      BIG_CUP,
    ]);
  });
});

describe('shouldKeepScreenAwake', () => {
  it('engages during the countdown and active states', () => {
    expect(shouldKeepScreenAwake('countdown')).toBe(true);
    expect(shouldKeepScreenAwake('active')).toBe(true);
  });

  it('releases outside the countdown and active states', () => {
    expect(shouldKeepScreenAwake('choosing')).toBe(false);
    expect(shouldKeepScreenAwake('completed')).toBe(false);
  });

  it('transitions correctly across a full sesh lifecycle', () => {
    let state: SeshState = INITIAL_SESH_STATE;
    expect(shouldKeepScreenAwake(state.status)).toBe(false);

    state = seshReducer(state, { type: 'trickSelected', trick: AIRPLANE, plan: OPEN_ENDED_SESH_PLAN });
    expect(shouldKeepScreenAwake(state.status)).toBe(true);

    state = seshReducer(state, { type: 'countdownCompleted', now: 1_000 });
    expect(shouldKeepScreenAwake(state.status)).toBe(true);

    state = seshReducer(state, { type: 'seshEnded', now: 2_000 });
    expect(shouldKeepScreenAwake(state.status)).toBe(false);
  });
});

function landing(elapsedMs: number): Landing {
  return { landedAt: 1_000 + elapsedMs, elapsedMs, intervalMs: elapsedMs };
}

function makeSeshSummary(overrides: Partial<SeshSummary> = {}): SeshSummary {
  return {
    trick: BIG_CUP,
    plan: createTimedSeshPlan(5),
    startedAt: 1_000,
    endedAt: 301_000,
    durationMs: 300_000,
    landings: [],
    ...overrides,
  };
}

describe('shouldPromptSeshNote', () => {
  it('triggers for a timed sesh that ended without landing the trick', () => {
    expect(shouldPromptSeshNote(makeSeshSummary({ landings: [] }))).toBe(true);
  });

  it('triggers for a timed sesh that landed the trick at least once', () => {
    expect(shouldPromptSeshNote(makeSeshSummary({ landings: [landing(1_000)] }))).toBe(true);
    expect(
      shouldPromptSeshNote(makeSeshSummary({ landings: [landing(1_000), landing(2_000)] })),
    ).toBe(true);
  });

  it('never triggers for an open-ended sesh, regardless of target or landings', () => {
    expect(
      shouldPromptSeshNote(makeSeshSummary({ plan: OPEN_ENDED_SESH_PLAN, landings: [] })),
    ).toBe(false);
    expect(
      shouldPromptSeshNote(
        makeSeshSummary({ plan: OPEN_ENDED_SESH_PLAN, landings: [landing(1_000)] }),
      ),
    ).toBe(false);
    expect(
      shouldPromptSeshNote(
        makeSeshSummary({ plan: createOpenEndedSeshPlan(5), landings: [] }),
      ),
    ).toBe(false);
    expect(
      shouldPromptSeshNote(
        makeSeshSummary({
          plan: createOpenEndedSeshPlan(5),
          landings: [landing(1_000), landing(2_000), landing(3_000), landing(4_000), landing(5_000)],
        }),
      ),
    ).toBe(false);
  });
});
