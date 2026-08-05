import { describe, expect, it } from '@jest/globals';

import {
  createCustomTrick,
  createCustomTrickId,
  customTrickReducer,
  INITIAL_CUSTOM_TRICKS,
  validateCustomTrickDraft,
} from '@/features/custom-tricks/model/custom-trick';

describe('custom tricks', () => {
  it('creates a trimmed standalone trick with optional Kentei placement', () => {
    const validation = validateCustomTrickDraft({
      kind: 'standalone',
      name: '  Stilt flip  ',
      kenteiRank: ' 8 ',
    });

    expect(validation).toEqual({
      status: 'valid',
      value: { kind: 'standalone', name: 'Stilt flip', kenteiRank: 8 },
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    expect(createCustomTrick('custom-stilt', validation.value)).toEqual({
      id: 'custom-stilt',
      kind: 'standalone',
      name: 'Stilt flip',
      kenteiRank: 8,
    });
  });

  it('creates a trimmed sequence with ordered free-text steps and no placement', () => {
    const validation = validateCustomTrickDraft({
      kind: 'sequence',
      name: '  Morning line  ',
      steps: [' Big cup ', ' Airplane ', ' Spike '],
    });

    expect(validation).toEqual({
      status: 'valid',
      value: {
        kind: 'sequence',
        name: 'Morning line',
        steps: ['Big cup', 'Airplane', 'Spike'],
      },
    });
  });

  it.each([
    { kind: 'standalone' as const, name: '   ' },
    { kind: 'standalone' as const, name: 'Valid', kenteiRank: '0' },
    { kind: 'standalone' as const, name: 'Valid', kenteiRank: '2.5' },
    { kind: 'standalone' as const, name: 'Valid', kenteiRank: '13' },
  ])('rejects invalid standalone input', (draft) => {
    expect(validateCustomTrickDraft(draft).status).toBe('invalid');
  });

  it.each([
    { kind: 'sequence' as const, name: 'Line', steps: ['Only one'] },
    { kind: 'sequence' as const, name: 'Line', steps: ['First', '   '] },
    { kind: 'sequence' as const, name: ' ', steps: ['First', 'Second'] },
  ])('rejects invalid sequence input', (draft) => {
    expect(validateCustomTrickDraft(draft).status).toBe('invalid');
  });

  it('uses a stable generated identifier that does not contain the editable name', () => {
    const id = createCustomTrickId(1_234_567, 0.25);
    const trick = {
      id,
      kind: 'standalone' as const,
      name: 'Original name',
    };

    expect(id).toBe(createCustomTrickId(1_234_567, 0.25));
    expect({ ...trick, name: 'Renamed trick' }.id).toBe(id);
    expect(id).not.toContain('original');
  });

  it('adds a trick once for a stable identifier', () => {
    const trick = { id: 'custom-1', kind: 'standalone' as const, name: 'Custom one' };
    const once = customTrickReducer(INITIAL_CUSTOM_TRICKS, {
      type: 'customTrickAdded',
      trick,
    });
    const twice = customTrickReducer(once, { type: 'customTrickAdded', trick });

    expect(once.tricks).toEqual([trick]);
    expect(twice).toBe(once);
  });
});
