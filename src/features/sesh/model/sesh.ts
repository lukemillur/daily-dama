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
  | { readonly status: 'active'; readonly trick: PracticeTrick; readonly plan: SeshPlan; readonly startedAt: number; readonly landings: readonly Landing[] }
  | { readonly status: 'completed'; readonly summary: SeshSummary };

export type SeshAction =
  | { readonly type: 'trickSelected'; readonly trick: PracticeTrick; readonly plan: SeshPlan }
  | { readonly type: 'countdownCompleted'; readonly now: number }
  | { readonly type: 'trickLaced'; readonly now: number }
  | { readonly type: 'seshEnded'; readonly now: number }
  | { readonly type: 'timerElapsed'; readonly now: number }
  | { readonly type: 'seshReset' };

export const INITIAL_SESH_STATE: SeshState = { status: 'choosing' };

export function seshReducer(state: SeshState, action: SeshAction): SeshState {
  switch (action.type) {
    case 'trickSelected':
      return { status: 'countdown', trick: action.trick, plan: action.plan };
    case 'countdownCompleted':
      return state.status === 'countdown'
        ? { status: 'active', trick: state.trick, plan: state.plan, startedAt: action.now, landings: [] }
        : state;
    case 'trickLaced': {
      if (state.status !== 'active') return state;

      if (
        action.now < state.startedAt ||
        (state.plan.kind === 'timed' && action.now >= state.startedAt + state.plan.durationMs)
      ) {
        return state;
      }

      const previousAt = state.landings.at(-1)?.landedAt ?? state.startedAt;
      return {
        ...state,
        landings: [
          ...state.landings,
          {
            landedAt: action.now,
            elapsedMs: action.now - state.startedAt,
            intervalMs: action.now - previousAt,
          },
        ],
      };
    }
    case 'seshEnded':
      if (state.status !== 'active') return state;
      return completeSesh(state, Math.max(state.startedAt, action.now));
    case 'timerElapsed':
      if (state.status !== 'active' || state.plan.kind !== 'timed') return state;
      if (action.now < state.startedAt + state.plan.durationMs) return state;
      return completeSesh(state, state.startedAt + state.plan.durationMs);
    case 'seshReset':
      return INITIAL_SESH_STATE;
  }
}

function completeSesh(state: Extract<SeshState, { status: 'active' }>, requestedEndAt: number): SeshState {
  const deadline =
    state.plan.kind === 'timed' ? state.startedAt + state.plan.durationMs : requestedEndAt;
  const endedAt = Math.min(requestedEndAt, deadline);

  return {
    status: 'completed',
    summary: {
      trick: state.trick,
      plan: state.plan,
      startedAt: state.startedAt,
      endedAt,
      durationMs: endedAt - state.startedAt,
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
