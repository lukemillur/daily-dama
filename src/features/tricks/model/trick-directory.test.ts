import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  createTrickSections,
  selectAvailablePracticeTricks,
} from '@/features/tricks/model/trick-directory';

const CUSTOM_TRICKS: readonly CustomTrick[] = [
  { id: 'custom-ranked', kind: 'standalone', name: 'Rank one custom', kenteiRank: 1 },
  {
    id: 'custom-sequence',
    kind: 'sequence',
    name: 'Unranked line',
    steps: [
      { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
      { kind: 'customText', name: 'Spike variation' },
    ],
  },
];

describe('profile trick directory', () => {
  it('places a ranked custom trick after all standard tricks at that rank', () => {
    const sections = createTrickSections(
      createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS),
    );
    const rankOne = sections.find(
      (section) => section.kind === 'ranked' && section.rank === 1,
    );

    expect(rankOne?.data.at(-1)).toMatchObject({
      id: 'custom-ranked',
      customKind: 'standalone',
      kenteiRank: 1,
      kenteiLevel: 'Basic',
      kenteiClass: '3rd Class',
    });
    expect(rankOne?.data.slice(0, -1)).toHaveLength(5);
  });

  it('places unranked tricks in a Custom section at the bottom', () => {
    const sections = createTrickSections(
      createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS),
    );

    expect(sections.at(-1)).toEqual({
      kind: 'custom',
      data: [
        {
          id: 'custom-sequence',
          name: 'Unranked line',
          customKind: 'sequence',
        },
      ],
    });
  });

  it('makes standard and custom tricks available to Sesh by stable ID', () => {
    const available = selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS);

    expect(available).toContainEqual({
      id: 'big-cup',
      name: 'Big cup',
      descriptor: 'Rank 1 · Basic',
    });
    expect(available).toContainEqual({
      id: 'custom-ranked',
      name: 'Rank one custom',
      descriptor: 'Custom trick',
    });
    expect(available).toContainEqual({
      id: 'custom-sequence',
      name: 'Unranked line',
      descriptor: 'Custom sequence',
      sequenceSteps: ['Big cup', 'Spike variation'],
    });
  });
});
