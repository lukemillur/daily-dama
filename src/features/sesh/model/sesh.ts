import type { TrickSummary } from '@/features/tricks/model/trick';

export interface Landing {
  readonly landedAt: number;
  readonly elapsedMs: number;
  readonly intervalMs: number;
}

export interface SeshSummary {
  readonly trick: TrickSummary;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly landings: readonly Landing[];
}

export type SeshState =
  | { readonly status: 'choosing' }
  | { readonly status: 'countdown'; readonly trick: TrickSummary }
  | { readonly status: 'active'; readonly trick: TrickSummary; readonly startedAt: number; readonly landings: readonly Landing[] }
  | { readonly status: 'completed'; readonly summary: SeshSummary };

export type SeshAction =
  | { readonly type: 'trickSelected'; readonly trick: TrickSummary }
  | { readonly type: 'countdownCompleted'; readonly now: number }
  | { readonly type: 'trickLaced'; readonly now: number }
  | { readonly type: 'seshEnded'; readonly now: number }
  | { readonly type: 'seshReset' };

export const INITIAL_SESH_STATE: SeshState = { status: 'choosing' };

export function seshReducer(state: SeshState, action: SeshAction): SeshState {
  switch (action.type) {
    case 'trickSelected':
      return { status: 'countdown', trick: action.trick };
    case 'countdownCompleted':
      return state.status === 'countdown'
        ? { status: 'active', trick: state.trick, startedAt: action.now, landings: [] }
        : state;
    case 'trickLaced': {
      if (state.status !== 'active') return state;

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
      return state.status === 'active'
        ? {
            status: 'completed',
            summary: {
              trick: state.trick,
              startedAt: state.startedAt,
              endedAt: action.now,
              durationMs: action.now - state.startedAt,
              landings: state.landings,
            },
          }
        : state;
    case 'seshReset':
      return INITIAL_SESH_STATE;
  }
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getAverageInterval(landings: readonly Landing[]) {
  if (landings.length === 0) return undefined;
  return landings.reduce((total, landing) => total + landing.intervalMs, 0) / landings.length;
}

export function getFastestInterval(landings: readonly Landing[]) {
  if (landings.length === 0) return undefined;
  return Math.min(...landings.map((landing) => landing.intervalMs));
}
