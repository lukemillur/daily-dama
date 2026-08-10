import type { PracticeTrick } from '@/features/tricks/model/trick';

export interface Landing {
  readonly landedAt: number;
  readonly elapsedMs: number;
  readonly intervalMs: number;
}

export type SeshPlan =
  | { readonly kind: 'openEnded' }
  | { readonly kind: 'timed'; readonly durationMs: number };

export const OPEN_ENDED_SESH_PLAN: SeshPlan = { kind: 'openEnded' };
export const MIN_TIMED_SESH_MINUTES = 1;
export const MAX_TIMED_SESH_MINUTES = 60;

export function isValidTimedSeshMinutes(durationMinutes: number) {
  return (
    Number.isInteger(durationMinutes) &&
    durationMinutes >= MIN_TIMED_SESH_MINUTES &&
    durationMinutes <= MAX_TIMED_SESH_MINUTES
  );
}

export function createTimedSeshPlan(durationMinutes: number): SeshPlan {
  if (!isValidTimedSeshMinutes(durationMinutes)) {
    throw new RangeError('A timed sesh must be a whole number of minutes from 1 to 60.');
  }
  return { kind: 'timed', durationMs: durationMinutes * 60_000 };
}

export interface SeshSummary {
  readonly trick: PracticeTrick;
  readonly plan: SeshPlan;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly landings: readonly Landing[];
}

export type SeshState =
  | { readonly status: 'choosing' }
  | { readonly status: 'countdown'; readonly trick: PracticeTrick; readonly plan: SeshPlan }
  | {
      readonly status: 'active';
      readonly trick: PracticeTrick;
      readonly plan: SeshPlan;
      readonly startedAt: number;
      readonly landings: readonly Landing[];
      readonly pausedAt?: number;
      readonly pausedDurationMs: number;
    }
  | { readonly status: 'completed'; readonly summary: SeshSummary };

export type SeshAction =
  | { readonly type: 'trickSelected'; readonly trick: PracticeTrick; readonly plan: SeshPlan }
  | { readonly type: 'countdownCompleted'; readonly now: number }
  | { readonly type: 'trickLaced'; readonly now: number }
  | { readonly type: 'seshPaused'; readonly now: number }
  | { readonly type: 'seshResumed'; readonly now: number }
  | { readonly type: 'seshEnded'; readonly now: number }
  | { readonly type: 'timerElapsed'; readonly now: number }
  | { readonly type: 'seshReset' };

export const INITIAL_SESH_STATE: SeshState = { status: 'choosing' };

/**
 * Whether the device screen should be kept awake for the given Sesh status.
 * True for the countdown and active states, since those are the states where
 * the user is expected to be hands-on with the kendama rather than the screen.
 */
export function shouldKeepScreenAwake(status: SeshState['status']): boolean {
  return status === 'countdown' || status === 'active';
}

export function seshReducer(state: SeshState, action: SeshAction): SeshState {
  switch (action.type) {
    case 'trickSelected':
      return { status: 'countdown', trick: action.trick, plan: action.plan };
    case 'countdownCompleted':
      return state.status === 'countdown'
        ? {
            status: 'active',
            trick: state.trick,
            plan: state.plan,
            startedAt: action.now,
            landings: [],
            pausedDurationMs: 0,
          }
        : state;
    case 'trickLaced': {
      if (state.status !== 'active' || state.pausedAt !== undefined) return state;

      if (
        action.now < state.startedAt ||
        (state.plan.kind === 'timed' &&
          action.now >= state.startedAt + state.plan.durationMs + state.pausedDurationMs)
      ) {
        return state;
      }

      const elapsedMs = action.now - state.startedAt - state.pausedDurationMs;
      const previousElapsedMs = state.landings.at(-1)?.elapsedMs ?? 0;
      return {
        ...state,
        landings: [
          ...state.landings,
          {
            landedAt: action.now,
            elapsedMs,
            intervalMs: elapsedMs - previousElapsedMs,
          },
        ],
      };
    }
    case 'seshPaused':
      if (state.status !== 'active' || state.pausedAt !== undefined) return state;
      return { ...state, pausedAt: action.now };
    case 'seshResumed':
      if (state.status !== 'active' || state.pausedAt === undefined) return state;
      return {
        ...state,
        pausedDurationMs: state.pausedDurationMs + Math.max(0, action.now - state.pausedAt),
        pausedAt: undefined,
      };
    case 'seshEnded':
      if (state.status !== 'active') return state;
      return completeSesh(state, Math.max(state.startedAt, action.now));
    case 'timerElapsed':
      if (state.status !== 'active' || state.plan.kind !== 'timed' || state.pausedAt !== undefined) {
        return state;
      }
      if (action.now < state.startedAt + state.plan.durationMs + state.pausedDurationMs) return state;
      return completeSesh(state, state.startedAt + state.plan.durationMs + state.pausedDurationMs);
    case 'seshReset':
      return INITIAL_SESH_STATE;
  }
}

function completeSesh(state: Extract<SeshState, { status: 'active' }>, requestedEndAt: number): SeshState {
  const totalPausedMs =
    state.pausedDurationMs + (state.pausedAt !== undefined ? Math.max(0, requestedEndAt - state.pausedAt) : 0);
  const deadline =
    state.plan.kind === 'timed'
      ? state.startedAt + state.plan.durationMs + totalPausedMs
      : requestedEndAt;
  const endedAt = Math.min(requestedEndAt, deadline);

  return {
    status: 'completed',
    summary: {
      trick: state.trick,
      plan: state.plan,
      startedAt: state.startedAt,
      endedAt,
      durationMs: endedAt - state.startedAt - totalPausedMs,
      landings: state.landings,
    },
  };
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatRemainingDuration(durationMs: number) {
  return formatDuration(Math.ceil(Math.max(0, durationMs) / 1000) * 1000);
}

export function getAverageInterval(landings: readonly Landing[]) {
  if (landings.length === 0) return undefined;
  return landings.reduce((total, landing) => total + landing.intervalMs, 0) / landings.length;
}

export function getFastestInterval(landings: readonly Landing[]) {
  if (landings.length === 0) return undefined;
  return Math.min(...landings.map((landing) => landing.intervalMs));
}

export function selectSeshPracticeTricks(
  availableTricks: readonly PracticeTrick[],
  selectedTrickIds: readonly string[],
  preferredTrickId?: string,
) {
  const selectedTricks = availableTricks.filter((trick) => selectedTrickIds.includes(trick.id));
  if (!preferredTrickId) return selectedTricks;

  const preferredTrick = availableTricks.find((trick) => trick.id === preferredTrickId);
  if (!preferredTrick) return selectedTricks;

  return [preferredTrick, ...selectedTricks.filter((trick) => trick.id !== preferredTrick.id)];
}
