import { describe, expect, it } from '@jest/globals';

import type { PracticeHistory, PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import {
  diffPracticeHistoryForOutboxOperations,
  mapPracticeHistoryToInsertInputs,
  mapPracticeSessionRecordToInsertInput,
  mapPracticeSessionRowToDomainRecord,
  mapPracticeSessionRowsToDomainHistory,
} from '@/features/stats/persistence/practice-history-cloud-mapping';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const LATER_TIMESTAMP = '2027-01-01T00:00:00.000Z';

function makePracticeSessionRow(overrides: Partial<PracticeSessionRow> = {}): PracticeSessionRow {
  return {
    user_id: USER_ID,
    id: 'session-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    started_at: 1_000,
    completed_at: 5_000,
    duration_ms: 4_000,
    lace_count: 3,
    planned_duration_ms: null,
    origin: null,
    created_at: TIMESTAMP,
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

/** Splices a `mapPracticeSessionRecordToInsertInput` result into a full row fixture. */
function toPracticeSessionRow(session: PracticeSessionRecord): PracticeSessionRow {
  const input = mapPracticeSessionRecordToInsertInput(session, USER_ID);
  return {
    user_id: input.user_id,
    id: input.id,
    trick_id: input.trick_id,
    trick_name: input.trick_name,
    started_at: input.started_at,
    completed_at: input.completed_at,
    duration_ms: input.duration_ms,
    lace_count: input.lace_count,
    planned_duration_ms: input.planned_duration_ms ?? null,
    origin: input.origin ?? null,
    created_at: TIMESTAMP,
  } as PracticeSessionRow;
}

function expectRoundTrip(session: PracticeSessionRecord) {
  const row = toPracticeSessionRow(session);
  const result = mapPracticeSessionRowToDomainRecord(row, USER_ID);
  expect(result).toEqual({ status: 'valid', session });
}

describe('round-trip: domain -> row -> domain', () => {
  it('round-trips an open-ended session (no plannedDurationMs, no origin)', () => {
    expectRoundTrip({
      id: 'session-open',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      startedAt: 1_000,
      completedAt: 5_000,
      durationMs: 4_000,
      laceCount: 2,
    });
  });

  it('round-trips a timed session with plannedDurationMs set', () => {
    expectRoundTrip({
      id: 'session-timed',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      startedAt: 1_000,
      completedAt: 31_000,
      durationMs: 30_000,
      laceCount: 5,
      plannedDurationMs: 30_000,
    });
  });

  it('round-trips an assessment session (origin set, no plannedDurationMs)', () => {
    expectRoundTrip({
      id: 'session-assessment',
      trickId: 'kentei-1-1',
      trickName: 'Big Cup',
      startedAt: 1_000,
      completedAt: 3_000,
      durationMs: 2_000,
      laceCount: 1,
      origin: 'assessment',
    });
  });

  it('round-trips a session that is both assessment and timed', () => {
    expectRoundTrip({
      id: 'session-assessment-timed',
      trickId: 'kentei-1-1',
      trickName: 'Big Cup',
      startedAt: 1_000,
      completedAt: 31_000,
      durationMs: 30_000,
      laceCount: 4,
      plannedDurationMs: 30_000,
      origin: 'assessment',
    });
  });

  it('round-trips a paused session where durationMs < completedAt - startedAt', () => {
    // Exercises the permissive-vs-DB-equality caveat directly: this session
    // was legitimately paused mid-practice, so active practice time
    // (durationMs) is less than wall-clock elapsed time. The DB's current
    // `practice_sessions_duration_matches_timing` CHECK would reject this
    // row on exact equality, but this mapper validates against the
    // permissive domain invariant instead.
    expectRoundTrip({
      id: 'session-paused',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      startedAt: 1_000,
      completedAt: 10_000,
      durationMs: 4_000,
      laceCount: 3,
    });
  });

  it('round-trips a whole PracticeHistory, preserving order', () => {
    const sessions: readonly PracticeSessionRecord[] = [
      {
        id: 'session-a',
        trickId: 'lighthouse',
        trickName: 'Lighthouse',
        startedAt: 1_000,
        completedAt: 5_000,
        durationMs: 4_000,
        laceCount: 2,
      },
      {
        id: 'session-b',
        trickId: 'kentei-1-1',
        trickName: 'Big Cup',
        startedAt: 6_000,
        completedAt: 8_000,
        durationMs: 2_000,
        laceCount: 1,
        origin: 'assessment',
      },
      {
        id: 'session-c',
        trickId: 'lighthouse',
        trickName: 'Lighthouse',
        startedAt: 9_000,
        completedAt: 39_000,
        durationMs: 30_000,
        laceCount: 6,
        plannedDurationMs: 30_000,
      },
    ];
    const history: PracticeHistory = { sessions };

    const rows = mapPracticeHistoryToInsertInputs(history, USER_ID).map((input) => toPracticeSessionRow({
      id: input.id,
      trickId: input.trick_id,
      trickName: input.trick_name,
      startedAt: input.started_at,
      completedAt: input.completed_at,
      durationMs: input.duration_ms,
      laceCount: input.lace_count,
      ...(input.planned_duration_ms !== null ? { plannedDurationMs: input.planned_duration_ms as number } : {}),
      ...(input.origin !== null ? { origin: input.origin as 'assessment' } : {}),
    }));

    const result = mapPracticeSessionRowsToDomainHistory(rows, USER_ID);
    expect(result).toEqual({ status: 'valid', history });
  });
});

describe('mapPracticeSessionRowToDomainRecord: malformed rows', () => {
  it('rejects started_at: 0', () => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ started_at: 0 }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'started_at' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it('rejects a negative started_at', () => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ started_at: -1 }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'started_at')).toBe(true);
  });

  it('rejects completed_at < started_at', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ started_at: 5_000, completed_at: 1_000 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'completed_at' && issue.reason === 'invariantViolation'),
    ).toBe(true);
  });

  it('rejects duration_ms > completed_at - started_at', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ started_at: 1_000, completed_at: 5_000, duration_ms: 5_000 }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'duration_ms' && issue.reason === 'invariantViolation'),
    ).toBe(true);
  });

  it('accepts duration_ms < completed_at - started_at (paused session, positive control)', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ started_at: 1_000, completed_at: 10_000, duration_ms: 4_000 }),
      USER_ID,
    );
    expect(result.status).toBe('valid');
  });

  it('rejects a non-integer lace_count', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ lace_count: 1.5 as unknown as number }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'lace_count' && issue.reason === 'wrongType'),
    ).toBe(true);
  });

  it('rejects a negative lace_count', () => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ lace_count: -1 }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'lace_count' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it.each([0, -1])('rejects planned_duration_ms = %s', (plannedDurationMs) => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ planned_duration_ms: plannedDurationMs }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'planned_duration_ms' && issue.reason === 'outOfRange'),
    ).toBe(true);
  });

  it("rejects origin: 'something-else'", () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ origin: 'something-else' }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'origin' && issue.reason === 'malformedShape'),
    ).toBe(true);
  });

  it('rejects a blank id', () => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ id: '' }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'id')).toBe(true);
  });

  it('rejects a blank trick_id', () => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ trick_id: '' }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'trick_id')).toBe(true);
  });

  it.each(['', '  Padded Name  '])('rejects a blank/untrimmed trick_name (%j)', (trickName) => {
    const result = mapPracticeSessionRowToDomainRecord(makePracticeSessionRow({ trick_name: trickName }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'trick_name')).toBe(true);
  });

  it('rejects a row belonging to a different user, as the only issue', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ user_id: OTHER_USER_ID }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues).toEqual([
      {
        path: 'user_id',
        reason: 'foreignUser',
        message: expect.any(String),
      },
    ]);
  });

  it('collects multiple simultaneous issues rather than failing fast', () => {
    const result = mapPracticeSessionRowToDomainRecord(
      makePracticeSessionRow({ lace_count: -1, origin: 'something-else' }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'lace_count')).toBe(true);
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'origin')).toBe(true);
  });
});

describe('duplicate/foreign-user rejection (batch-level)', () => {
  it('rejects two rows in the same batch sharing the same id', () => {
    const rowA = makePracticeSessionRow({ id: 'dup-1' });
    const rowB = makePracticeSessionRow({ id: 'dup-1' });

    const result = mapPracticeSessionRowsToDomainHistory([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'duplicateId')).toBe(true);
  });

  it('rejects a batch where one row belongs to a different user, even if the rest are valid', () => {
    const rowA = makePracticeSessionRow({ id: 'session-a' });
    const rowB = makePracticeSessionRow({ id: 'session-b', user_id: OTHER_USER_ID });

    const result = mapPracticeSessionRowsToDomainHistory([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'foreignUser')).toBe(true);
  });
});

describe('historical-name preservation', () => {
  it('maps trick_name straight through unchanged, without resolving via trick_id', () => {
    const row = makePracticeSessionRow({ trick_id: 'lighthouse', trick_name: 'Renamed Lighthouse' });
    const result = mapPracticeSessionRowToDomainRecord(row, USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.session.trickName).toBe('Renamed Lighthouse');
  });
});

describe('server receipt timestamp vs client domain timestamps', () => {
  it('maps to the exact same PracticeSessionRecord regardless of created_at', () => {
    const rowEarly = makePracticeSessionRow({ created_at: TIMESTAMP });
    const rowLate = makePracticeSessionRow({ created_at: LATER_TIMESTAMP });

    const resultEarly = mapPracticeSessionRowToDomainRecord(rowEarly, USER_ID);
    const resultLate = mapPracticeSessionRowToDomainRecord(rowLate, USER_ID);

    expect(resultEarly).toEqual(resultLate);
  });

  it('does not include created_at in the insert-input mapper output', () => {
    const session: PracticeSessionRecord = {
      id: 'session-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      startedAt: 1_000,
      completedAt: 5_000,
      durationMs: 4_000,
      laceCount: 3,
    };
    const insertInput = mapPracticeSessionRecordToInsertInput(session, USER_ID);
    expect(insertInput).not.toHaveProperty('created_at');
  });
});

describe('no input mutation', () => {
  it('does not mutate a frozen PracticeSessionRecord passed to the domain -> row mapper', () => {
    const session = deepFreeze<PracticeSessionRecord>({
      id: 'session-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      startedAt: 1_000,
      completedAt: 5_000,
      durationMs: 4_000,
      laceCount: 3,
      plannedDurationMs: 4_000,
      origin: 'assessment',
    });
    const before = JSON.stringify(session);

    expect(() => mapPracticeSessionRecordToInsertInput(session, USER_ID)).not.toThrow();

    expect(JSON.stringify(session)).toBe(before);
  });

  it('does not mutate a frozen PracticeHistory passed to mapPracticeHistoryToInsertInputs', () => {
    const history = deepFreeze<PracticeHistory>({
      sessions: [
        {
          id: 'session-1',
          trickId: 'lighthouse',
          trickName: 'Lighthouse',
          startedAt: 1_000,
          completedAt: 5_000,
          durationMs: 4_000,
          laceCount: 3,
        },
      ],
    });
    const before = JSON.stringify(history);

    expect(() => mapPracticeHistoryToInsertInputs(history, USER_ID)).not.toThrow();

    expect(JSON.stringify(history)).toBe(before);
  });

  it('does not mutate a frozen PracticeSessionRow passed to the row -> domain mappers', () => {
    const row = deepFreeze<PracticeSessionRow>(makePracticeSessionRow());
    const rows = deepFreeze<PracticeSessionRow[]>([row]);
    const rowBefore = JSON.stringify(row);
    const rowsBefore = JSON.stringify(rows);

    expect(() => mapPracticeSessionRowToDomainRecord(row, USER_ID)).not.toThrow();
    expect(() => mapPracticeSessionRowsToDomainHistory(rows, USER_ID)).not.toThrow();

    expect(JSON.stringify(row)).toBe(rowBefore);
    expect(JSON.stringify(rows)).toBe(rowsBefore);
  });
});

function makeSession(id: string, overrides: Partial<PracticeSessionRecord> = {}): PracticeSessionRecord {
  return {
    id,
    trickId: 'lighthouse',
    trickName: 'Lighthouse',
    startedAt: 1_000,
    completedAt: 5_000,
    durationMs: 4_000,
    laceCount: 2,
    ...overrides,
  };
}

describe('diffPracticeHistoryForOutboxOperations', () => {
  it('emits no operations for an identical PracticeHistory', () => {
    const history: PracticeHistory = { sessions: [makeSession('session-1')] };
    expect(diffPracticeHistoryForOutboxOperations(history, history, USER_ID)).toEqual([]);
  });

  it('emits an upsert for one newly added session', () => {
    const previous: PracticeHistory = { sessions: [] };
    const added = makeSession('session-new');
    const next: PracticeHistory = { sessions: [added] };

    expect(diffPracticeHistoryForOutboxOperations(previous, next, USER_ID)).toEqual([
      {
        domain: 'practiceHistory',
        operationType: 'upsert',
        recordId: 'session-new',
        payload: mapPracticeSessionRecordToInsertInput(added, USER_ID),
      },
    ]);
  });

  it('emits operations for several new sessions in stable ascending-id order', () => {
    const previous: PracticeHistory = { sessions: [] };
    const sessionB = makeSession('session-b');
    const sessionA = makeSession('session-a');
    const sessionC = makeSession('session-c');
    // Deliberately out-of-order in `next.sessions` to prove the diff sorts, not just preserves.
    const next: PracticeHistory = { sessions: [sessionB, sessionC, sessionA] };

    const operations = diffPracticeHistoryForOutboxOperations(previous, next, USER_ID);
    expect(operations.map((op) => op.recordId)).toEqual(['session-a', 'session-b', 'session-c']);
  });

  it('emits no operation for a session present in both previous and next (immutable, no content diff)', () => {
    const session = makeSession('session-unchanged');
    const previous: PracticeHistory = { sessions: [session] };
    // Byte-identical content, present in both -- a regression guard against
    // accidentally reintroducing a content-diff (this domain's records
    // never change, unlike custom tricks).
    const next: PracticeHistory = { sessions: [session] };

    expect(diffPracticeHistoryForOutboxOperations(previous, next, USER_ID)).toEqual([]);
  });

  it('emits only the new session when previous and next share one session and add another', () => {
    const shared = makeSession('session-shared');
    const added = makeSession('session-added', { startedAt: 2_000, completedAt: 6_000 });
    const previous: PracticeHistory = { sessions: [shared] };
    const next: PracticeHistory = { sessions: [shared, added] };

    const operations = diffPracticeHistoryForOutboxOperations(previous, next, USER_ID);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.recordId).toBe('session-added');
  });
});
