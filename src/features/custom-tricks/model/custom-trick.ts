import type { PracticeTrick } from '@/features/tricks/model/trick';

interface CustomTrickBase extends PracticeTrick {
  readonly kenteiRank?: number;
}

export interface StandaloneCustomTrick extends CustomTrickBase {
  readonly kind: 'standalone';
}

export interface SequenceCustomTrick extends CustomTrickBase {
  readonly kind: 'sequence';
  readonly steps: readonly string[];
}

export type CustomTrick = StandaloneCustomTrick | SequenceCustomTrick;

export type CustomTrickDraft =
  | {
      readonly kind: 'standalone';
      readonly name: string;
      readonly kenteiRank?: string;
    }
  | {
      readonly kind: 'sequence';
      readonly name: string;
      readonly steps: readonly string[];
      readonly kenteiRank?: string;
    };

export interface CustomTrickDraftErrors {
  readonly name?: string;
  readonly steps?: string;
  readonly kenteiRank?: string;
}

export type CustomTrickDraftValidation =
  | { readonly status: 'invalid'; readonly errors: CustomTrickDraftErrors }
  | {
      readonly status: 'valid';
      readonly value:
        | Omit<StandaloneCustomTrick, 'id'>
        | Omit<SequenceCustomTrick, 'id'>;
    };

export function validateCustomTrickDraft(draft: CustomTrickDraft): CustomTrickDraftValidation {
  const name = draft.name.trim();
  const errors: { name?: string; steps?: string; kenteiRank?: string } = {};
  const rankText = draft.kenteiRank?.trim() ?? '';
  const rank = rankText === '' ? undefined : Number(rankText);

  if (name.length === 0) {
    errors.name = draft.kind === 'sequence' ? 'Enter a sequence name.' : 'Enter a trick name.';
  }
  if (
    rank !== undefined &&
    (!Number.isInteger(rank) || rank < 1 || rank > 12)
  ) {
    errors.kenteiRank = 'Use a whole Kentei rank from 1 to 12, or leave it blank.';
  }

  if (draft.kind === 'sequence') {
    const steps = draft.steps.map((step) => step.trim());
    if (steps.length < 2) errors.steps = 'A sequence needs at least two steps.';
    else if (steps.some((step) => step.length === 0)) {
      errors.steps = 'Every sequence step needs a name.';
    }

    if (Object.keys(errors).length > 0) return { status: 'invalid', errors };
    return {
      status: 'valid',
      value: { kind: 'sequence', name, steps, ...(rank === undefined ? {} : { kenteiRank: rank }) },
    };
  }

  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };
  return {
    status: 'valid',
    value: { kind: 'standalone', name, ...(rank === undefined ? {} : { kenteiRank: rank }) },
  };
}

export function createCustomTrick(
  id: string,
  validatedDraft: Extract<CustomTrickDraftValidation, { status: 'valid' }>['value'],
): CustomTrick {
  return { id, ...validatedDraft };
}

export function createCustomTrickId(now = Date.now(), random = Math.random()) {
  return `custom-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export interface CustomTrickCollection {
  readonly tricks: readonly CustomTrick[];
}

export const INITIAL_CUSTOM_TRICKS: CustomTrickCollection = { tricks: [] };

export type CustomTrickAction =
  | { readonly type: 'customTricksRestored'; readonly collection: CustomTrickCollection }
  | { readonly type: 'customTrickAdded'; readonly trick: CustomTrick }
  | { readonly type: 'customTrickUpdated'; readonly trick: CustomTrick }
  | { readonly type: 'customTrickDeleted'; readonly trickId: string };

export function customTrickReducer(
  state: CustomTrickCollection,
  action: CustomTrickAction,
): CustomTrickCollection {
  switch (action.type) {
    case 'customTricksRestored':
      return action.collection;
    case 'customTrickAdded':
      return state.tricks.some((trick) => trick.id === action.trick.id)
        ? state
        : { tricks: [...state.tricks, action.trick] };
    case 'customTrickUpdated': {
      const index = state.tricks.findIndex((trick) => trick.id === action.trick.id);
      if (index === -1) return state;
      return {
        tricks: state.tricks.map((trick) =>
          trick.id === action.trick.id ? action.trick : trick,
        ),
      };
    }
    case 'customTrickDeleted':
      return state.tricks.some((trick) => trick.id === action.trickId)
        ? { tricks: state.tricks.filter((trick) => trick.id !== action.trickId) }
        : state;
  }
}
