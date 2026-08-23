import { describe, expect, it } from '@jest/globals';

import type { Goal } from '@/features/goals/model/goal';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import {
  mapGoalRowToDomainEntry,
  mapGoalRowsToDomainEntries,
  mapGoalToInsertInput,
  prepareGoalDeletionPatch,
  type GoalCloudEntry,
} from '@/features/goals/persistence/goal-cloud-mapping';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TIMESTAMP_MS = Date.parse(TIMESTAMP);
const DELETED_TIMESTAMP = '2026-02-01T00:00:00.000Z';
const DELETED_TIMESTAMP_MS = Date.parse(DELETED_TIMESTAMP);

function makeGoalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    user_id: USER_ID,
    id: 'goal-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    kind: 'count',
    target_count: 10,
    target_ms: null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: null,
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

/** Splices a `mapGoalToInsertInput` result into a full row fixture. */
function toGoalRow(goal: Goal, overrides: Partial<GoalRow> = {}): GoalRow {
  const input = mapGoalToInsertInput(goal, USER_ID);
  return {
    user_id: input.user_id,
    id: input.id,
    trick_id: input.trick_id,
    trick_name: input.trick_name,
    kind: input.kind as string,
    target_count: input.target_count ?? null,
    target_ms: input.target_ms ?? null,
    revision: 1,
    created_at: new Date(goal.createdAt).toISOString(),
    updated_at: new Date(goal.createdAt).toISOString(),
    deleted_at: null,
    ...overrides,
  } as GoalRow;
}

function expectRoundTrip(goal: Goal) {
  const row = toGoalRow(goal);
  const result = mapGoalRowToDomainEntry(row, USER_ID);
  expect(result).toEqual({ status: 'valid', entry: { status: 'active', goal, meta: { revision: 1 } } });
}

describe('round-trip: domain -> row -> domain', () => {
  it('round-trips a count-kind goal', () => {
    expectRoundTrip({
      id: 'goal-count',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'count',
      targetCount: 25,
      createdAt: TIMESTAMP_MS,
    });
  });

  it('round-trips a time-kind goal', () => {
    expectRoundTrip({
      id: 'goal-time',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'time',
      targetMs: 5 * 60_000,
      createdAt: TIMESTAMP_MS,
    });
  });

  it('round-trips a tombstoned row to a deleted entry, preserving snapshot fields', () => {
    const row = makeGoalRow({
      id: 'goal-deleted',
      target_count: 42,
      revision: 3,
      created_at: TIMESTAMP,
      deleted_at: DELETED_TIMESTAMP,
    });
    const result = mapGoalRowToDomainEntry(row, USER_ID);
    expect(result).toEqual({
      status: 'valid',
      entry: {
        status: 'deleted',
        goal: {
          id: 'goal-deleted',
          trickId: 'lighthouse',
          trickName: 'Lighthouse',
          kind: 'count',
          targetCount: 42,
          createdAt: TIMESTAMP_MS,
        },
        meta: { revision: 3, deletedAt: DELETED_TIMESTAMP_MS },
      },
    });
  });
});

describe('mapGoalRowToDomainEntry: ambiguous variant rejection', () => {
  it("rejects kind: 'count' with a non-null target_ms", () => {
    const result = mapGoalRowToDomainEntry(makeGoalRow({ kind: 'count', target_count: 5, target_ms: 60_000 }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'target_ms' && issue.reason === 'ambiguousVariant'),
    ).toBe(true);
  });

  it("rejects kind: 'time' with a non-null target_count", () => {
    const result = mapGoalRowToDomainEntry(
      makeGoalRow({ kind: 'time', target_count: 5, target_ms: 60_000 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'target_count' && issue.reason === 'ambiguousVariant'),
    ).toBe(true);
  });

  it('rejects both target_count and target_ms populated regardless of kind', () => {
    const countResult = mapGoalRowToDomainEntry(
      makeGoalRow({ kind: 'count', target_count: 5, target_ms: 60_000 }),
      USER_ID,
    );
    const timeResult = mapGoalRowToDomainEntry(
      makeGoalRow({ kind: 'time', target_count: 5, target_ms: 60_000 }),
      USER_ID,
    );
    expect(countResult.status).toBe('invalid');
    expect(timeResult.status).toBe('invalid');
  });

  it('rejects an unknown kind value', () => {
    const result = mapGoalRowToDomainEntry(
      makeGoalRow({ kind: 'distance', target_count: null, target_ms: null }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'kind' && issue.reason === 'malformedShape'),
    ).toBe(true);
  });
});

describe('mapGoalRowToDomainEntry: out-of-range targets', () => {
  it.each([0, -1, 1.5, 100_001])('rejects target_count = %s', (targetCount) => {
    const result = mapGoalRowToDomainEntry(makeGoalRow({ kind: 'count', target_count: targetCount }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'target_count' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it.each([0, -60_000, 90_000, 100_001 * 60_000])('rejects target_ms = %s', (targetMs) => {
    const result = mapGoalRowToDomainEntry(
      makeGoalRow({ kind: 'time', target_count: null, target_ms: targetMs }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'target_ms' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });
});

describe('mapGoalRowToDomainEntry: malformed revision', () => {
  it.each([0, -1, 1.5, '1', NaN])('rejects revision = %s', (revision) => {
    const result = mapGoalRowToDomainEntry(makeGoalRow({ revision: revision as unknown as number }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'revision' && issue.reason === 'invalidRevision'),
    ).toBe(true);
  });
});

describe('mapGoalRowToDomainEntry: malformed deleted_at', () => {
  it('rejects a non-ISO-parseable deleted_at', () => {
    const result = mapGoalRowToDomainEntry(makeGoalRow({ deleted_at: 'not-a-date' }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'deleted_at')).toBe(true);
  });
});

describe('mapGoalRowToDomainEntry: foreign user', () => {
  it('rejects a row belonging to a different user, as the only issue', () => {
    const result = mapGoalRowToDomainEntry(makeGoalRow({ user_id: OTHER_USER_ID }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues).toEqual([
      { path: 'user_id', reason: 'foreignUser', message: expect.any(String) },
    ]);
  });
});

describe('mapGoalRowsToDomainEntries', () => {
  it('returns a valid empty result for an empty row list', () => {
    const result = mapGoalRowsToDomainEntries([], USER_ID);
    expect(result).toEqual({ status: 'valid', entries: [] });
  });

  it('rejects two rows in the same batch sharing the same id', () => {
    const rowA = makeGoalRow({ id: 'dup-1' });
    const rowB = makeGoalRow({ id: 'dup-1' });
    const result = mapGoalRowsToDomainEntries([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'duplicateId')).toBe(true);
  });

  it('includes both active and tombstoned entries in one batch, without filtering', () => {
    const rowActive = makeGoalRow({ id: 'goal-active' });
    const rowDeleted = makeGoalRow({ id: 'goal-deleted', deleted_at: DELETED_TIMESTAMP });
    const result = mapGoalRowsToDomainEntries([rowActive, rowDeleted], USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entries.map((entry) => entry.status)).toEqual(['active', 'deleted']);
  });

  it('preserves input order', () => {
    const rowA = makeGoalRow({ id: 'goal-a' });
    const rowB = makeGoalRow({ id: 'goal-b' });
    const rowC = makeGoalRow({ id: 'goal-c' });
    const result = mapGoalRowsToDomainEntries([rowC, rowA, rowB], USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entries.map((entry) => entry.goal.id)).toEqual([
      'goal-c',
      'goal-a',
      'goal-b',
    ]);
  });
});

describe('mapGoalToInsertInput', () => {
  it('maps a count-kind goal, omitting revision/created_at/updated_at/deleted_at', () => {
    const goal: Goal = {
      id: 'goal-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'count',
      targetCount: 10,
      createdAt: TIMESTAMP_MS,
    };
    const input = mapGoalToInsertInput(goal, USER_ID);
    expect(input).toEqual({
      user_id: USER_ID,
      id: 'goal-1',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    expect(Object.keys(input).sort()).toEqual(
      ['user_id', 'id', 'trick_id', 'trick_name', 'kind', 'target_count', 'target_ms'].sort(),
    );
  });

  it('maps a time-kind goal', () => {
    const goal: Goal = {
      id: 'goal-2',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'time',
      targetMs: 5 * 60_000,
      createdAt: TIMESTAMP_MS,
    };
    const input = mapGoalToInsertInput(goal, USER_ID);
    expect(input).toEqual({
      user_id: USER_ID,
      id: 'goal-2',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'time',
      target_count: null,
      target_ms: 5 * 60_000,
    });
  });
});

describe('prepareGoalDeletionPatch', () => {
  const activeEntry: GoalCloudEntry = {
    status: 'active',
    goal: {
      id: 'goal-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'count',
      targetCount: 10,
      createdAt: TIMESTAMP_MS,
    },
    meta: { revision: 1 },
  };

  it('prepares a patch for an active entry with a sane revision', () => {
    const result = prepareGoalDeletionPatch(activeEntry, DELETED_TIMESTAMP_MS);
    expect(result).toEqual({ status: 'prepared', patch: { deleted_at: new Date(DELETED_TIMESTAMP_MS).toISOString() } });
  });

  it('rejects an already-deleted known entry (stale mutation)', () => {
    const deletedEntry: GoalCloudEntry = {
      status: 'deleted',
      goal: activeEntry.goal,
      meta: { revision: 1, deletedAt: DELETED_TIMESTAMP_MS },
    };
    const result = prepareGoalDeletionPatch(deletedEntry, DELETED_TIMESTAMP_MS + 1);
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: expect.any(String) },
    });
  });

  it.each([0, 1.5])('rejects a hand-constructed entry with a malformed revision (%s)', (revision) => {
    const malformedEntry: GoalCloudEntry = {
      status: 'active',
      goal: activeEntry.goal,
      meta: { revision },
    };
    const result = prepareGoalDeletionPatch(malformedEntry, DELETED_TIMESTAMP_MS);
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: expect.any(String) },
    });
  });
});

describe('no input mutation', () => {
  it('does not mutate a frozen Goal passed to the domain -> insert mapper', () => {
    const goal = deepFreeze<Goal>({
      id: 'goal-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      kind: 'count',
      targetCount: 10,
      createdAt: TIMESTAMP_MS,
    });
    const before = JSON.stringify(goal);

    expect(() => mapGoalToInsertInput(goal, USER_ID)).not.toThrow();

    expect(JSON.stringify(goal)).toBe(before);
  });

  it('does not mutate a frozen GoalRow (active and tombstoned) passed to the row mappers', () => {
    const rowActive = deepFreeze<GoalRow>(makeGoalRow());
    const rowDeleted = deepFreeze<GoalRow>(makeGoalRow({ id: 'goal-deleted', deleted_at: DELETED_TIMESTAMP }));
    const rows = deepFreeze<GoalRow[]>([rowActive, rowDeleted]);
    const activeBefore = JSON.stringify(rowActive);
    const deletedBefore = JSON.stringify(rowDeleted);
    const rowsBefore = JSON.stringify(rows);

    expect(() => mapGoalRowToDomainEntry(rowActive, USER_ID)).not.toThrow();
    expect(() => mapGoalRowToDomainEntry(rowDeleted, USER_ID)).not.toThrow();
    expect(() => mapGoalRowsToDomainEntries(rows, USER_ID)).not.toThrow();

    expect(JSON.stringify(rowActive)).toBe(activeBefore);
    expect(JSON.stringify(rowDeleted)).toBe(deletedBefore);
    expect(JSON.stringify(rows)).toBe(rowsBefore);
  });

  it('does not mutate a frozen GoalCloudEntry passed to the mutation-prep function', () => {
    const entry = deepFreeze<GoalCloudEntry>({
      status: 'active',
      goal: {
        id: 'goal-1',
        trickId: 'lighthouse',
        trickName: 'Lighthouse',
        kind: 'count',
        targetCount: 10,
        createdAt: TIMESTAMP_MS,
      },
      meta: { revision: 1 },
    });
    const before = JSON.stringify(entry);

    expect(() => prepareGoalDeletionPatch(entry, DELETED_TIMESTAMP_MS)).not.toThrow();

    expect(JSON.stringify(entry)).toBe(before);
  });
});
