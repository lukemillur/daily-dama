import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import {
  mapCustomTrickCollectionToUpsertInputs,
  mapCustomTrickRowToDomainTrick,
  mapCustomTrickRowsToDomainCollection,
  mapCustomTrickToUpsertInput,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function makeCustomTrickRow(overrides: Partial<CustomTrickRow> = {}): CustomTrickRow {
  return {
    user_id: USER_ID,
    id: 'custom-1',
    kind: 'standalone',
    name: 'Around the World',
    kentei_rank: null,
    steps: null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze((value as Record<string, unknown>)[key]);
    });
    Object.freeze(value);
  }
  return value;
}

/** Splices a `mapCustomTrickToUpsertInput` result into a full row fixture. */
function toCustomTrickRow(trick: CustomTrick): CustomTrickRow {
  const input = mapCustomTrickToUpsertInput(trick, USER_ID);
  return {
    user_id: input.user_id,
    id: input.id,
    kind: input.kind,
    name: input.name,
    kentei_rank: input.kentei_rank ?? null,
    steps: input.steps ?? null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  } as CustomTrickRow;
}

function expectRoundTrip(trick: CustomTrick) {
  const row = toCustomTrickRow(trick);
  const result = mapCustomTrickRowToDomainTrick(row, USER_ID);
  expect(result).toEqual({ status: 'valid', trick });
}

describe('round-trip: domain -> row -> domain', () => {
  it('round-trips a standalone trick with no kenteiRank', () => {
    expectRoundTrip({ id: 'custom-1', kind: 'standalone', name: 'Around the World' });
  });

  it('round-trips a standalone trick with kenteiRank at the lower boundary (1)', () => {
    expectRoundTrip({ id: 'custom-1', kind: 'standalone', name: 'Lighthouse', kenteiRank: 1 });
  });

  it('round-trips a standalone trick with kenteiRank at the upper boundary (12)', () => {
    expectRoundTrip({ id: 'custom-1', kind: 'standalone', name: 'Lighthouse', kenteiRank: 12 });
  });

  it('round-trips a sequence with only existingTrick steps', () => {
    expectRoundTrip({
      id: 'custom-seq-1',
      kind: 'sequence',
      name: 'Warmup Combo',
      steps: [
        { kind: 'existingTrick', name: 'Lighthouse', sourceTrickId: 'kentei-1-1' },
        { kind: 'existingTrick', name: 'Around the World', sourceTrickId: 'kentei-1-2' },
      ],
    });
  });

  it('round-trips a sequence with only customText steps', () => {
    expectRoundTrip({
      id: 'custom-seq-2',
      kind: 'sequence',
      name: 'Freestyle Combo',
      steps: [
        { kind: 'customText', name: 'Spike toss' },
        { kind: 'customText', name: 'Juggle catch' },
      ],
    });
  });

  it('round-trips a sequence with a mix of both step kinds', () => {
    expectRoundTrip({
      id: 'custom-seq-3',
      kind: 'sequence',
      name: 'Mixed Combo',
      steps: [
        { kind: 'existingTrick', name: 'Lighthouse', sourceTrickId: 'kentei-1-1' },
        { kind: 'customText', name: 'Custom flourish' },
      ],
    });
  });

  it('round-trips a sequence with kenteiRank set', () => {
    expectRoundTrip({
      id: 'custom-seq-4',
      kind: 'sequence',
      name: 'Ranked Combo',
      kenteiRank: 7,
      steps: [
        { kind: 'customText', name: 'Step one' },
        { kind: 'customText', name: 'Step two' },
      ],
    });
  });

  it('round-trips a whole collection, preserving order', () => {
    const tricks: readonly CustomTrick[] = [
      { id: 'custom-1', kind: 'standalone', name: 'Around the World' },
      {
        id: 'custom-seq-1',
        kind: 'sequence',
        name: 'Warmup Combo',
        steps: [
          { kind: 'customText', name: 'Step one' },
          { kind: 'customText', name: 'Step two' },
        ],
      },
      { id: 'custom-2', kind: 'standalone', name: 'Lighthouse', kenteiRank: 3 },
    ];

    const rows = mapCustomTrickCollectionToUpsertInputs({ tricks }, USER_ID).map(
      (input) =>
        ({
          user_id: input.user_id,
          id: input.id,
          kind: input.kind,
          name: input.name,
          kentei_rank: input.kentei_rank ?? null,
          steps: input.steps ?? null,
          revision: 1,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        }) as CustomTrickRow,
    );

    const result = mapCustomTrickRowsToDomainCollection(rows, USER_ID);
    expect(result).toEqual({ status: 'valid', collection: { tricks } });
  });
});

describe('mapCustomTrickRowToDomainTrick: malformed rows', () => {
  it('rejects an unknown kind value', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({ kind: 'weird' as unknown as CustomTrickRow['kind'] }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'kind' && issue.reason === 'malformedShape')).toBe(true);
  });

  it.each(['', '  Blank Name  ', ' '])('rejects a blank/untrimmed name (%j)', (name) => {
    const result = mapCustomTrickRowToDomainTrick(makeCustomTrickRow({ name }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'name')).toBe(true);
  });

  it.each([0, 13, 1.5])('rejects kentei_rank = %s', (kenteiRank) => {
    const result = mapCustomTrickRowToDomainTrick(makeCustomTrickRow({ kentei_rank: kenteiRank }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'kentei_rank' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it('rejects a standalone row with non-null steps', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({ steps: [{ kind: 'customText', name: 'x' }] as unknown as CustomTrickRow['steps'] }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps')).toBe(true);
  });

  it('rejects a sequence row with steps: null', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({ kind: 'sequence', steps: null }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps')).toBe(true);
  });

  it.each([
    { label: 'empty array', steps: [] },
    { label: 'single-element array', steps: [{ kind: 'customText', name: 'only one' }] },
  ])('rejects a sequence row with steps of length < 2 ($label)', ({ steps }) => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({ kind: 'sequence', steps: steps as unknown as CustomTrickRow['steps'] }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps')).toBe(true);
  });

  it('rejects a sequence step missing name', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [{ kind: 'customText' }, { kind: 'customText', name: 'ok' }] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps[0]')).toBe(true);
  });

  it('rejects a sequence step with an untrimmed/empty name', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [
          { kind: 'customText', name: '  padded  ' },
          { kind: 'customText', name: 'ok' },
        ] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps[0]')).toBe(true);
  });

  it('rejects a customText step carrying an extra sourceTrickId key', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [
          { kind: 'customText', name: 'a', sourceTrickId: 'kentei-1-1' },
          { kind: 'customText', name: 'b' },
        ] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps[0]')).toBe(true);
  });

  it('rejects an existingTrick step missing sourceTrickId', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [
          { kind: 'existingTrick', name: 'a' },
          { kind: 'customText', name: 'b' },
        ] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps[0]')).toBe(true);
  });

  it('rejects an existingTrick step with an empty sourceTrickId', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [
          { kind: 'existingTrick', name: 'a', sourceTrickId: '' },
          { kind: 'customText', name: 'b' },
        ] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'steps[0]')).toBe(true);
  });

  it('rejects an existingTrick step that self-references its own row id (not nestedSequence)', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({
        id: 'custom-seq-self',
        kind: 'sequence',
        steps: [
          { kind: 'existingTrick', name: 'a', sourceTrickId: 'custom-seq-self' },
          { kind: 'customText', name: 'b' },
        ] as unknown as CustomTrickRow['steps'],
      }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'steps[0]' && issue.reason === 'malformedShape'),
    ).toBe(true);
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'nestedSequence')).toBe(false);
  });

  it('rejects a row belonging to a different user', () => {
    const result = mapCustomTrickRowToDomainTrick(makeCustomTrickRow({ user_id: OTHER_USER_ID }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' && result.issues.some((issue) => issue.path === 'user_id' && issue.reason === 'foreignUser'),
    ).toBe(true);
  });

  it('collects multiple simultaneous issues rather than failing fast', () => {
    const result = mapCustomTrickRowToDomainTrick(
      makeCustomTrickRow({ kind: 'weird' as unknown as CustomTrickRow['kind'], kentei_rank: 13 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'kind')).toBe(true);
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'kentei_rank')).toBe(true);
  });
});

describe('nested-sequence rejection (batch-level)', () => {
  it('rejects a sequence row referencing another sequence row', () => {
    const rowA = makeCustomTrickRow({
      id: 'seq-a',
      kind: 'sequence',
      name: 'Combo A',
      steps: [
        { kind: 'existingTrick', name: 'Nested', sourceTrickId: 'seq-b' },
        { kind: 'customText', name: 'Step two' },
      ] as unknown as CustomTrickRow['steps'],
    });
    const rowB = makeCustomTrickRow({
      id: 'seq-b',
      kind: 'sequence',
      name: 'Combo B',
      steps: [
        { kind: 'customText', name: 'Step one' },
        { kind: 'customText', name: 'Step two' },
      ] as unknown as CustomTrickRow['steps'],
    });

    const result = mapCustomTrickRowsToDomainCollection([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'nestedSequence')).toBe(true);
  });

  it('accepts a sequence row referencing a standalone row (negative control)', () => {
    const rowA = makeCustomTrickRow({
      id: 'seq-a',
      kind: 'sequence',
      name: 'Combo A',
      steps: [
        { kind: 'existingTrick', name: 'Standalone Ref', sourceTrickId: 'standalone-b' },
        { kind: 'customText', name: 'Step two' },
      ] as unknown as CustomTrickRow['steps'],
    });
    const rowB = makeCustomTrickRow({ id: 'standalone-b', kind: 'standalone', name: 'Standalone Trick' });

    const result = mapCustomTrickRowsToDomainCollection([rowA, rowB], USER_ID);
    expect(result.status).toBe('valid');
  });
});

describe('duplicate-id rejection', () => {
  it('rejects two rows sharing the same id', () => {
    const rowA = makeCustomTrickRow({ id: 'dup-1', name: 'First' });
    const rowB = makeCustomTrickRow({ id: 'dup-1', name: 'Second' });

    const result = mapCustomTrickRowsToDomainCollection([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'duplicateId')).toBe(true);
  });
});

describe('stored-name preservation', () => {
  it('preserves the stored step name even when the referenced row has since been renamed', () => {
    const sequenceRow = makeCustomTrickRow({
      id: 'seq-with-ref',
      kind: 'sequence',
      name: 'Combo',
      steps: [
        { kind: 'existingTrick', name: 'Old Name', sourceTrickId: 'trick-b' },
        { kind: 'customText', name: 'Step two' },
      ] as unknown as CustomTrickRow['steps'],
    });
    const renamedRow = makeCustomTrickRow({ id: 'trick-b', kind: 'standalone', name: 'New Name' });

    const result = mapCustomTrickRowsToDomainCollection([sequenceRow, renamedRow], USER_ID);
    expect(result.status).toBe('valid');
    const sequenceTrick =
      result.status === 'valid' && result.collection.tricks.find((trick) => trick.id === 'seq-with-ref');
    expect(sequenceTrick && sequenceTrick.kind === 'sequence' ? sequenceTrick.steps[0].name : undefined).toBe(
      'Old Name',
    );
  });

  it('preserves the stored step name and does not flag nestedSequence when the referenced row is absent (deleted)', () => {
    const sequenceRow = makeCustomTrickRow({
      id: 'seq-with-deleted-ref',
      kind: 'sequence',
      name: 'Combo',
      steps: [
        { kind: 'existingTrick', name: 'Old Name', sourceTrickId: 'deleted-trick' },
        { kind: 'customText', name: 'Step two' },
      ] as unknown as CustomTrickRow['steps'],
    });

    const result = mapCustomTrickRowsToDomainCollection([sequenceRow], USER_ID);
    expect(result.status).toBe('valid');
    const sequenceTrick =
      result.status === 'valid' && result.collection.tricks.find((trick) => trick.id === 'seq-with-deleted-ref');
    expect(sequenceTrick && sequenceTrick.kind === 'sequence' ? sequenceTrick.steps[0].name : undefined).toBe(
      'Old Name',
    );
  });
});

describe('no input mutation', () => {
  it('does not mutate a frozen standalone CustomTrick passed to the domain -> row mapper', () => {
    const trick = deepFreeze<CustomTrick>({ id: 'custom-1', kind: 'standalone', name: 'Around the World', kenteiRank: 5 });
    const before = JSON.stringify(trick);

    expect(() => mapCustomTrickToUpsertInput(trick, USER_ID)).not.toThrow();

    expect(JSON.stringify(trick)).toBe(before);
  });

  it('does not mutate a frozen sequence CustomTrick passed to the domain -> row mappers', () => {
    const trick = deepFreeze<CustomTrick>({
      id: 'custom-seq-1',
      kind: 'sequence',
      name: 'Warmup Combo',
      steps: [
        { kind: 'existingTrick', name: 'Lighthouse', sourceTrickId: 'kentei-1-1' },
        { kind: 'customText', name: 'Custom flourish' },
      ],
    });
    const before = JSON.stringify(trick);

    expect(() => mapCustomTrickToUpsertInput(trick, USER_ID)).not.toThrow();
    expect(() => mapCustomTrickCollectionToUpsertInputs({ tricks: [trick] }, USER_ID)).not.toThrow();

    expect(JSON.stringify(trick)).toBe(before);
  });

  it('does not mutate frozen CustomTrickRow inputs passed to the row -> domain mappers', () => {
    const row = deepFreeze<CustomTrickRow>(
      makeCustomTrickRow({
        kind: 'sequence',
        steps: [
          { kind: 'existingTrick', name: 'Lighthouse', sourceTrickId: 'kentei-1-1' },
          { kind: 'customText', name: 'Custom flourish' },
        ] as unknown as CustomTrickRow['steps'],
      }),
    );
    const rows = deepFreeze<CustomTrickRow[]>([row]);
    const rowBefore = JSON.stringify(row);
    const rowsBefore = JSON.stringify(rows);

    expect(() => mapCustomTrickRowToDomainTrick(row, USER_ID)).not.toThrow();
    expect(() => mapCustomTrickRowsToDomainCollection(rows, USER_ID)).not.toThrow();

    expect(JSON.stringify(row)).toBe(rowBefore);
    expect(JSON.stringify(rows)).toBe(rowsBefore);
  });
});
