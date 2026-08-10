import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  createTrickSections,
  selectAvailablePracticeTricks,
  selectLacedCountByTrickId,
  selectUnlockedTrickIds,
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

describe('selectLacedCountByTrickId', () => {
  it('sums laceCount across multiple sessions for the same trick', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 8 }),
      session({ id: 'big-cup-2', trickId: 'big-cup', laceCount: 3 }),
    ]);

    expect(counts.get('big-cup')).toBe(11);
  });

  it('keeps a trick with a zero-lace session in the map at value 0', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 0 }),
    ]);

    expect(counts.has('airplane')).toBe(true);
    expect(counts.get('airplane')).toBe(0);
  });

  it('leaves a trick with no sessions absent from the map', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 5 }),
    ]);

    expect(counts.has('never-practiced')).toBe(false);
  });

  it('does not let unrelated trick IDs bleed into each other', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 8 }),
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 2 }),
    ]);

    expect(counts.get('big-cup')).toBe(8);
    expect(counts.get('airplane')).toBe(2);
  });
});

describe('selectUnlockedTrickIds', () => {
  it('marks a trick with at least one practice-history record as unlocked', () => {
    const unlocked = selectUnlockedTrickIds([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 4 }),
    ]);

    expect(unlocked.has('big-cup')).toBe(true);
  });

  it('unlocks a trick even when its only record has zero laces', () => {
    const unlocked = selectUnlockedTrickIds([
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 0 }),
    ]);

    expect(unlocked.has('airplane')).toBe(true);
  });

  it('leaves a trick with no practice-history records locked', () => {
    const unlocked = selectUnlockedTrickIds([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 5 }),
    ]);

    expect(unlocked.has('never-practiced')).toBe(false);
  });
});
