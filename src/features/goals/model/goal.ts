import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

export const MIN_GOAL_TARGET_COUNT = 1;
export const MAX_GOAL_TARGET_COUNT = 100_000;
export const MIN_GOAL_TARGET_MINUTES = 1;
export const MAX_GOAL_TARGET_MINUTES = 100_000;

export interface GoalBase {
  readonly id: string;
  readonly trickId: string;
  readonly trickName: string;
  readonly createdAt: number;
}

export type Goal =
  | (GoalBase & { readonly kind: 'count'; readonly targetCount: number })
  | (GoalBase & { readonly kind: 'time'; readonly targetMs: number });

export interface GoalCollection {
  readonly goals: readonly Goal[];
}

export const INITIAL_GOALS: GoalCollection = { goals: [] };

export type GoalCreationInput =
  | { readonly kind: 'count'; readonly trickId: string; readonly trickName: string; readonly targetCount: number }
  | { readonly kind: 'time'; readonly trickId: string; readonly trickName: string; readonly targetMinutes: number };

export interface GoalDraftErrors {
  readonly trickId?: string;
  readonly trickName?: string;
  readonly target?: string;
}

export type GoalCreationValidValue =
  | { readonly kind: 'count'; readonly trickId: string; readonly trickName: string; readonly targetCount: number }
  | { readonly kind: 'time'; readonly trickId: string; readonly trickName: string; readonly targetMs: number };

export type GoalCreationValidation =
  | { readonly status: 'invalid'; readonly errors: GoalDraftErrors }
  | { readonly status: 'valid'; readonly value: GoalCreationValidValue };

export function isValidGoalTargetCount(targetCount: number) {
  return (
    Number.isInteger(targetCount) &&
    targetCount >= MIN_GOAL_TARGET_COUNT &&
    targetCount <= MAX_GOAL_TARGET_COUNT
  );
}

export function isValidGoalTargetMinutes(targetMinutes: number) {
  return (
    Number.isInteger(targetMinutes) &&
    targetMinutes >= MIN_GOAL_TARGET_MINUTES &&
    targetMinutes <= MAX_GOAL_TARGET_MINUTES
  );
}

export function validateGoalCreation(input: GoalCreationInput): GoalCreationValidation {
  const trickId = input.trickId.trim();
  const trickName = input.trickName.trim();
  const errors: { trickId?: string; trickName?: string; target?: string } = {};

  if (trickId.length === 0) errors.trickId = 'A goal needs a trick to attach to.';
  if (trickName.length === 0) errors.trickName = 'A goal needs a trick name snapshot.';

  if (input.kind === 'count') {
    if (!isValidGoalTargetCount(input.targetCount)) {
      errors.target = `Enter a whole number of laces from ${MIN_GOAL_TARGET_COUNT} to ${MAX_GOAL_TARGET_COUNT}.`;
    }
  } else {
    if (!isValidGoalTargetMinutes(input.targetMinutes)) {
      errors.target = `Enter a whole number of minutes from ${MIN_GOAL_TARGET_MINUTES} to ${MAX_GOAL_TARGET_MINUTES}.`;
    }
  }

  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  return {
    status: 'valid',
    value:
      input.kind === 'count'
        ? { kind: 'count', trickId, trickName, targetCount: input.targetCount }
        : { kind: 'time', trickId, trickName, targetMs: input.targetMinutes * 60_000 },
  };
}

export function createGoalId(now = Date.now(), random = Math.random()) {
  return `goal-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export function createGoal(id: string, value: GoalCreationValidValue, createdAt: number = Date.now()): Goal {
  return value.kind === 'count'
    ? {
        id,
        trickId: value.trickId,
        trickName: value.trickName,
        kind: 'count',
        targetCount: value.targetCount,
        createdAt,
      }
    : {
        id,
        trickId: value.trickId,
        trickName: value.trickName,
        kind: 'time',
        targetMs: value.targetMs,
        createdAt,
      };
}

// T157.7: a goal's `kind` (and its trick attachment) never changes in
// place -- editing only ever changes the numeric target within the same
// kind, matching the DB UPDATE grant's shape (target_count/target_ms only,
// never trick_id/trick_name/kind). Reuses the same target validators
// `validateGoalCreation` uses.
export type GoalTargetEditInput =
  | { readonly kind: 'count'; readonly targetCount: number }
  | { readonly kind: 'time'; readonly targetMinutes: number };

export interface GoalTargetEditErrors {
  readonly target?: string;
}

export type GoalTargetEditValidValue =
  | { readonly kind: 'count'; readonly targetCount: number }
  | { readonly kind: 'time'; readonly targetMs: number };

export type GoalTargetEditValidation =
  | { readonly status: 'invalid'; readonly errors: GoalTargetEditErrors }
  | { readonly status: 'valid'; readonly value: GoalTargetEditValidValue };

export function validateGoalTargetEdit(input: GoalTargetEditInput): GoalTargetEditValidation {
  if (input.kind === 'count') {
    if (!isValidGoalTargetCount(input.targetCount)) {
      return {
        status: 'invalid',
        errors: { target: `Enter a whole number of laces from ${MIN_GOAL_TARGET_COUNT} to ${MAX_GOAL_TARGET_COUNT}.` },
      };
    }
    return { status: 'valid', value: { kind: 'count', targetCount: input.targetCount } };
  }

  if (!isValidGoalTargetMinutes(input.targetMinutes)) {
    return {
      status: 'invalid',
      errors: { target: `Enter a whole number of minutes from ${MIN_GOAL_TARGET_MINUTES} to ${MAX_GOAL_TARGET_MINUTES}.` },
    };
  }
  return { status: 'valid', value: { kind: 'time', targetMs: input.targetMinutes * 60_000 } };
}

/** Applies an already-validated target edit to an existing goal, preserving id/trick/kind/createdAt. */
export function applyGoalTargetEdit(goal: Goal, value: GoalTargetEditValidValue): Goal {
  return value.kind === 'count'
    ? { id: goal.id, trickId: goal.trickId, trickName: goal.trickName, kind: 'count', targetCount: value.targetCount, createdAt: goal.createdAt }
    : { id: goal.id, trickId: goal.trickId, trickName: goal.trickName, kind: 'time', targetMs: value.targetMs, createdAt: goal.createdAt };
}

export type GoalAction =
  | { readonly type: 'goalsRestored'; readonly collection: GoalCollection }
  | { readonly type: 'goalAdded'; readonly goal: Goal }
  | { readonly type: 'goalEdited'; readonly goal: Goal }
  | { readonly type: 'goalDeleted'; readonly goalId: string };

export function goalReducer(state: GoalCollection, action: GoalAction): GoalCollection {
  switch (action.type) {
    case 'goalsRestored':
      return action.collection;
    case 'goalAdded':
      return state.goals.some((goal) => goal.id === action.goal.id)
        ? state
        : { goals: [...state.goals, action.goal] };
    case 'goalEdited':
      return state.goals.some((goal) => goal.id === action.goal.id)
        ? { goals: state.goals.map((goal) => (goal.id === action.goal.id ? action.goal : goal)) }
        : state;
    case 'goalDeleted':
      return state.goals.some((goal) => goal.id === action.goalId)
        ? { goals: state.goals.filter((goal) => goal.id !== action.goalId) }
        : state;
  }
}

export function selectGoalsForTrick(goals: readonly Goal[], trickId: string): readonly Goal[] {
  return goals
    .filter((goal) => goal.trickId === trickId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface GoalProgress {
  readonly goal: Goal;
  readonly current: number;
  readonly target: number;
  readonly achieved: boolean;
}

export function selectGoalProgress(
  goal: Goal,
  sessions: readonly PracticeSessionRecord[],
): GoalProgress {
  const trickSessions = sessions.filter(
    (session) => session.trickId === goal.trickId && session.completedAt >= goal.createdAt,
  );
  const current =
    goal.kind === 'count'
      ? trickSessions.reduce((sum, session) => sum + session.laceCount, 0)
      : trickSessions.reduce((sum, session) => sum + session.durationMs, 0);
  const target = goal.kind === 'count' ? goal.targetCount : goal.targetMs;
  return { goal, current, target, achieved: current >= target };
}

export interface TrickGoalGroup {
  readonly trickId: string;
  readonly trickName: string;
  readonly progress: readonly GoalProgress[];
}

export function selectGoalProgressByTrick(
  goals: readonly Goal[],
  sessions: readonly PracticeSessionRecord[],
): readonly TrickGoalGroup[] {
  const groupsByTrickId = new Map<string, { trickName: string; goals: Goal[] }>();

  for (const goal of goals) {
    const group = groupsByTrickId.get(goal.trickId);
    if (group) group.goals.push(goal);
    else groupsByTrickId.set(goal.trickId, { trickName: goal.trickName, goals: [goal] });
  }

  return Array.from(groupsByTrickId.entries())
    .map(([trickId, group]) => ({
      trickId,
      trickName: group.trickName,
      progress: group.goals
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((goal) => selectGoalProgress(goal, sessions)),
    }))
    .sort((a, b) => a.trickName.localeCompare(b.trickName));
}

export function getGoalContribution(goal: Goal, landingCount: number, durationMs: number): number {
  return goal.kind === 'count' ? landingCount : durationMs;
}

export function isGoalNewlyAchieved(goal: Goal, baselineCurrent: number, contribution: number): boolean {
  const target = goal.kind === 'count' ? goal.targetCount : goal.targetMs;
  return baselineCurrent < target && baselineCurrent + contribution >= target;
}
