import { describe, expect, it } from '@jest/globals';

import {
  createCustomTrick,
  customTrickReducer,
  INITIAL_CUSTOM_TRICKS,
} from '@/features/custom-tricks/model/custom-trick';
import {
  createGoal,
  createGoalId,
  goalReducer,
  INITIAL_GOALS,
  selectGoalsForTrick,
  validateGoalCreation,
} from '@/features/goals/model/goal';

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
