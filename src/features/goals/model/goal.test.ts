import { describe, expect, it } from '@jest/globals';

import {
  createCustomTrick,
  customTrickReducer,
  INITIAL_CUSTOM_TRICKS,
} from '@/features/custom-tricks/model/custom-trick';
import {
  createGoal,
  createGoalId,
  getGoalContribution,
  goalReducer,
  INITIAL_GOALS,
  isGoalNewlyAchieved,
  selectGoalProgress,
  selectGoalProgressByTrick,
  selectGoalsForTrick,
  validateGoalCreation,
} from '@/features/goals/model/goal';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

describe('goals', () => {
  it('creates a count-based goal storing the trick id, trick name snapshot, and target lace count', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 50,
    });

    expect(validation).toEqual({
      status: 'valid',
      value: { kind: 'count', trickId: 'big-cup', trickName: 'Big cup', targetCount: 50 },
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');

    const goal = createGoal(createGoalId(1_000, 0.5), validation.value, 1_000);
    expect(goal).toEqual({
      id: createGoalId(1_000, 0.5),
      trickId: 'big-cup',
      trickName: 'Big cup',
      kind: 'count',
      targetCount: 50,
      createdAt: 1_000,
    });
  });

  it('creates a time-based goal storing the trick id, trick name snapshot, and target cumulative time', () => {
    const validation = validateGoalCreation({
      kind: 'time',
      trickId: 'stilt-flip',
      trickName: 'Stilt flip',
      targetMinutes: 90,
    });

    expect(validation).toEqual({
      status: 'valid',
      value: { kind: 'time', trickId: 'stilt-flip', trickName: 'Stilt flip', targetMs: 90 * 60_000 },
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');

    const goal = createGoal('goal-1', validation.value, 2_000);
    expect(goal).toEqual({
      id: 'goal-1',
      trickId: 'stilt-flip',
      trickName: 'Stilt flip',
      kind: 'time',
      targetMs: 5_400_000,
      createdAt: 2_000,
    });
  });

  it('rejects a goal without a trick id or trick name', () => {
    expect(
      validateGoalCreation({ kind: 'count', trickId: '', trickName: 'Big cup', targetCount: 10 }).status,
    ).toBe('invalid');
    expect(
      validateGoalCreation({ kind: 'count', trickId: 'big-cup', trickName: ' ', targetCount: 10 }).status,
    ).toBe('invalid');
  });

  it('rejects a non-integer, zero, or negative target count', () => {
    expect(
      validateGoalCreation({ kind: 'count', trickId: 'big-cup', trickName: 'Big cup', targetCount: 0 }).status,
    ).toBe('invalid');
    expect(
      validateGoalCreation({ kind: 'count', trickId: 'big-cup', trickName: 'Big cup', targetCount: -5 }).status,
    ).toBe('invalid');
    expect(
      validateGoalCreation({ kind: 'count', trickId: 'big-cup', trickName: 'Big cup', targetCount: 3.5 }).status,
    ).toBe('invalid');
  });

  it('rejects a non-integer, zero, or negative target time in minutes', () => {
    expect(
      validateGoalCreation({ kind: 'time', trickId: 'big-cup', trickName: 'Big cup', targetMinutes: 0 }).status,
    ).toBe('invalid');
    expect(
      validateGoalCreation({ kind: 'time', trickId: 'big-cup', trickName: 'Big cup', targetMinutes: -1 }).status,
    ).toBe('invalid');
    expect(
      validateGoalCreation({ kind: 'time', trickId: 'big-cup', trickName: 'Big cup', targetMinutes: 2.2 }).status,
    ).toBe('invalid');
  });

  it('adds a goal once for a stable identifier', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);
    const once = goalReducer(INITIAL_GOALS, { type: 'goalAdded', goal });
    const twice = goalReducer(once, { type: 'goalAdded', goal });

    expect(once.goals).toEqual([goal]);
    expect(twice).toBe(once);
  });

  it('deletes a goal when its id is found, and no-ops when it is missing', () => {
    const firstValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    const secondValidation = validateGoalCreation({
      kind: 'time',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetMinutes: 20,
    });
    if (firstValidation.status !== 'valid' || secondValidation.status !== 'valid') {
      throw new Error('Expected valid drafts.');
    }
    const first = createGoal('goal-1', firstValidation.value, 1);
    const second = createGoal('goal-2', secondValidation.value, 2);
    const state = { goals: [first, second] };

    expect(goalReducer(state, { type: 'goalDeleted', goalId: first.id }).goals).toEqual([second]);
    expect(goalReducer(state, { type: 'goalDeleted', goalId: 'missing' })).toBe(state);
  });

  it('sorts goals for a trick by createdAt descending', () => {
    const olderValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    const newerValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 20,
    });
    const otherValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'other-trick',
      trickName: 'Other',
      targetCount: 5,
    });
    if (
      olderValidation.status !== 'valid' ||
      newerValidation.status !== 'valid' ||
      otherValidation.status !== 'valid'
    ) {
      throw new Error('Expected valid drafts.');
    }
    const older = createGoal('goal-1', olderValidation.value, 1);
    const newer = createGoal('goal-2', newerValidation.value, 2);
    const other = createGoal('goal-3', otherValidation.value, 3);

    expect(selectGoalsForTrick([older, newer, other], 'big-cup')).toEqual([newer, older]);
  });

  it('leaves a goal unchanged when its source custom trick is later renamed or deleted', () => {
    const customTrick = createCustomTrick('custom-source', { kind: 'standalone', name: 'Stilt flip' });
    const customTrickState = customTrickReducer(INITIAL_CUSTOM_TRICKS, {
      type: 'customTrickAdded',
      trick: customTrick,
    });

    const validation = validateGoalCreation({
      kind: 'count',
      trickId: customTrick.id,
      trickName: customTrick.name,
      targetCount: 25,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);
    const goalState = goalReducer(INITIAL_GOALS, { type: 'goalAdded', goal });

    const renamedCustomTrickState = customTrickReducer(customTrickState, {
      type: 'customTrickUpdated',
      trick: { ...customTrick, name: 'Renamed trick' },
    });
    const deletedCustomTrickState = customTrickReducer(renamedCustomTrickState, {
      type: 'customTrickDeleted',
      trickId: customTrick.id,
    });

    expect(deletedCustomTrickState.tricks).toEqual([]);
    expect(goalState.goals).toEqual([goal]);
    expect(goalState.goals[0]).toBe(goal);
    expect(goalState.goals[0]?.trickName).toBe('Stilt flip');
  });
});

describe('selectGoalProgressByTrick', () => {
  it('returns [] for no goals', () => {
    expect(selectGoalProgressByTrick([], [])).toEqual([]);
  });

  it('groups goals across two tricks into two groups sorted by trick name', () => {
    const zebraValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'zebra-trick',
      trickName: 'Zebra trick',
      targetCount: 5,
    });
    const appleValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'apple-trick',
      trickName: 'Apple trick',
      targetCount: 10,
    });
    if (zebraValidation.status !== 'valid' || appleValidation.status !== 'valid') {
      throw new Error('Expected valid drafts.');
    }
    const zebraGoal = createGoal('goal-zebra', zebraValidation.value, 1);
    const appleGoal = createGoal('goal-apple', appleValidation.value, 2);

    const groups = selectGoalProgressByTrick([zebraGoal, appleGoal], []);

    expect(groups.map((group) => group.trickName)).toEqual(['Apple trick', 'Zebra trick']);
    expect(groups[0]?.progress.map((progress) => progress.goal.id)).toEqual(['goal-apple']);
    expect(groups[1]?.progress.map((progress) => progress.goal.id)).toEqual(['goal-zebra']);
  });

  it('sorts multiple goals for the same trick newest-first within one group', () => {
    const olderValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    const newerValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 20,
    });
    if (olderValidation.status !== 'valid' || newerValidation.status !== 'valid') {
      throw new Error('Expected valid drafts.');
    }
    const older = createGoal('goal-1', olderValidation.value, 1);
    const newer = createGoal('goal-2', newerValidation.value, 2);

    const groups = selectGoalProgressByTrick([older, newer], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.trickId).toBe('big-cup');
    expect(groups[0]?.progress.map((progress) => progress.goal.id)).toEqual(['goal-2', 'goal-1']);
  });
});

function session(overrides: Partial<PracticeSessionRecord>): PracticeSessionRecord {
  return {
    id: 'session-1',
    trickId: 'big-cup',
    trickName: 'Big cup',
    startedAt: 1_000,
    completedAt: 61_000,
    durationMs: 60_000,
    laceCount: 0,
    ...overrides,
  };
}

describe('selectGoalProgress', () => {
  it('sums lace count from history for a count-based goal and marks it achieved at target', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    const belowTarget = [
      session({ id: 's-1', trickId: 'big-cup', laceCount: 4 }),
      session({ id: 's-2', trickId: 'big-cup', laceCount: 3 }),
      session({ id: 's-3', trickId: 'airplane', laceCount: 100 }),
    ];
    expect(selectGoalProgress(goal, belowTarget)).toEqual({
      goal,
      current: 7,
      target: 10,
      achieved: false,
    });

    const atTarget = [
      session({ id: 's-1', trickId: 'big-cup', laceCount: 4 }),
      session({ id: 's-2', trickId: 'big-cup', laceCount: 6 }),
    ];
    expect(selectGoalProgress(goal, atTarget)).toEqual({
      goal,
      current: 10,
      target: 10,
      achieved: true,
    });
  });

  it('sums practice duration from history for a time-based goal and marks it achieved at target', () => {
    const validation = validateGoalCreation({
      kind: 'time',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetMinutes: 2,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    const belowTarget = [
      session({ id: 's-1', trickId: 'big-cup', durationMs: 30_000 }),
      session({ id: 's-2', trickId: 'big-cup', durationMs: 40_000 }),
      session({ id: 's-3', trickId: 'airplane', durationMs: 500_000 }),
    ];
    expect(selectGoalProgress(goal, belowTarget)).toEqual({
      goal,
      current: 70_000,
      target: 120_000,
      achieved: false,
    });

    const atTarget = [
      session({ id: 's-1', trickId: 'big-cup', durationMs: 90_000 }),
      session({ id: 's-2', trickId: 'big-cup', durationMs: 30_000 }),
    ];
    expect(selectGoalProgress(goal, atTarget)).toEqual({
      goal,
      current: 120_000,
      target: 120_000,
      achieved: true,
    });
  });

  it('returns zero progress and not achieved when no sessions match the goal trick', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 5,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    const sessions = [session({ id: 's-1', trickId: 'airplane', laceCount: 50 })];
    expect(selectGoalProgress(goal, sessions)).toEqual({
      goal,
      current: 0,
      target: 5,
      achieved: false,
    });
  });
});

describe('getGoalContribution', () => {
  it('uses the landing count for a count-based goal and the duration for a time-based goal', () => {
    const countValidation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 10,
    });
    if (countValidation.status !== 'valid') throw new Error('Expected a valid draft.');
    const countGoal = createGoal('goal-count', countValidation.value, 1);

    const timeValidation = validateGoalCreation({
      kind: 'time',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetMinutes: 2,
    });
    if (timeValidation.status !== 'valid') throw new Error('Expected a valid draft.');
    const timeGoal = createGoal('goal-time', timeValidation.value, 1);

    expect(getGoalContribution(countGoal, 3, 45_000)).toBe(3);
    expect(getGoalContribution(timeGoal, 3, 45_000)).toBe(45_000);
  });
});

describe('isGoalNewlyAchieved', () => {
  it('returns false when the contribution does not cross the target', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 5,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    expect(isGoalNewlyAchieved(goal, 2, 1)).toBe(false);
  });

  it('returns true when the contribution exactly crosses the target', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 5,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    expect(isGoalNewlyAchieved(goal, 4, 1)).toBe(true);
  });

  it('returns true when the contribution overshoots past the target', () => {
    const validation = validateGoalCreation({
      kind: 'time',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetMinutes: 2,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    expect(isGoalNewlyAchieved(goal, 90_000, 60_000)).toBe(true);
  });

  it('returns false when the goal was already achieved before this contribution, regardless of contribution size', () => {
    const validation = validateGoalCreation({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big cup',
      targetCount: 5,
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const goal = createGoal('goal-1', validation.value, 1);

    expect(isGoalNewlyAchieved(goal, 5, 0)).toBe(false);
    expect(isGoalNewlyAchieved(goal, 10, 100)).toBe(false);
  });
});
