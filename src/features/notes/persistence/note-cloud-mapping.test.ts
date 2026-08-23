import { describe, expect, it } from '@jest/globals';

import type { Note } from '@/features/notes/model/note';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import {
  mapNoteRowToDomainEntry,
  mapNoteRowsToDomainEntries,
  mapNoteToInsertInput,
  prepareNoteDeletionPatch,
  prepareNoteEditPatch,
  type NoteCloudEntry,
} from '@/features/notes/persistence/note-cloud-mapping';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TIMESTAMP_MS = Date.parse(TIMESTAMP);
const LATER_TIMESTAMP = '2026-01-02T00:00:00.000Z';
const LATER_TIMESTAMP_MS = Date.parse(LATER_TIMESTAMP);
const DELETED_TIMESTAMP = '2026-02-01T00:00:00.000Z';
const DELETED_TIMESTAMP_MS = Date.parse(DELETED_TIMESTAMP);

function makeNoteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    user_id: USER_ID,
    id: 'note-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    body: 'Getting the timing down.',
    practice_session_id: null,
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

/** Splices a `mapNoteToInsertInput` result into a full row fixture. */
function toNoteRow(note: Note, overrides: Partial<NoteRow> = {}): NoteRow {
  const input = mapNoteToInsertInput(note, USER_ID);
  return {
    user_id: input.user_id,
    id: input.id,
    trick_id: input.trick_id,
    trick_name: input.trick_name,
    body: input.body,
    practice_session_id: input.practice_session_id ?? null,
    revision: 1,
    created_at: new Date(note.createdAt).toISOString(),
    updated_at: new Date(note.updatedAt).toISOString(),
    deleted_at: null,
    ...overrides,
  } as NoteRow;
}

function expectRoundTrip(note: Note) {
  const row = toNoteRow(note);
  const result = mapNoteRowToDomainEntry(row, USER_ID);
  expect(result).toEqual({ status: 'valid', entry: { status: 'active', note, meta: { revision: 1 } } });
}

describe('round-trip: domain -> row -> domain', () => {
  it('round-trips a note without a practiceSessionId', () => {
    expectRoundTrip({
      id: 'note-plain',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Getting the timing down.',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    });
  });

  it('round-trips a note with a practiceSessionId', () => {
    expectRoundTrip({
      id: 'note-with-session',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Nailed it during a Sesh.',
      practiceSessionId: '1000:5000:lighthouse',
      createdAt: TIMESTAMP_MS,
      updatedAt: LATER_TIMESTAMP_MS,
    });
  });

  it('round-trips a tombstoned row to a deleted entry, preserving snapshot fields', () => {
    const row = makeNoteRow({
      id: 'note-deleted',
      body: 'Old note.',
      revision: 3,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: DELETED_TIMESTAMP,
    });
    const result = mapNoteRowToDomainEntry(row, USER_ID);
    expect(result).toEqual({
      status: 'valid',
      entry: {
        status: 'deleted',
        note: {
          id: 'note-deleted',
          trickId: 'lighthouse',
          trickName: 'Lighthouse',
          body: 'Old note.',
          createdAt: TIMESTAMP_MS,
          updatedAt: TIMESTAMP_MS,
        },
        meta: { revision: 3, deletedAt: DELETED_TIMESTAMP_MS },
      },
    });
  });
});

describe('mapNoteRowToDomainEntry: practice_session_id shape', () => {
  it('accepts null practice_session_id', () => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ practice_session_id: null }), USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entry.note.practiceSessionId).toBeUndefined();
  });

  it('accepts a non-empty trimmed practice_session_id', () => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ practice_session_id: '1000:5000:lighthouse' }), USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entry.note.practiceSessionId).toBe('1000:5000:lighthouse');
  });

  it.each(['', '   ', ' padded '])('rejects a blank/untrimmed practice_session_id (%j)', (practiceSessionId) => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ practice_session_id: practiceSessionId }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some(
          (issue) => issue.path === 'practice_session_id' && issue.reason === 'invalidSessionAssociation',
        ),
    ).toBe(true);
  });

  it('rejects a non-string practice_session_id', () => {
    const result = mapNoteRowToDomainEntry(
      makeNoteRow({ practice_session_id: 12345 as unknown as string }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some(
          (issue) => issue.path === 'practice_session_id' && issue.reason === 'invalidSessionAssociation',
        ),
    ).toBe(true);
  });
});

describe('mapNoteRowToDomainEntry: malformed revision', () => {
  it.each([0, -1, 1.5, '1', NaN])('rejects revision = %s', (revision) => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ revision: revision as unknown as number }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'revision' && issue.reason === 'invalidRevision'),
    ).toBe(true);
  });
});

describe('mapNoteRowToDomainEntry: malformed deleted_at', () => {
  it('rejects a non-ISO-parseable deleted_at', () => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ deleted_at: 'not-a-date' }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.path === 'deleted_at')).toBe(true);
  });
});

describe('mapNoteRowToDomainEntry: updated_at < created_at invariant', () => {
  it('rejects updated_at earlier than created_at', () => {
    const result = mapNoteRowToDomainEntry(
      makeNoteRow({ created_at: LATER_TIMESTAMP, updated_at: TIMESTAMP }),
      USER_ID,
    );
    expect(result.status).toBe('invalid');
    expect(
      result.status === 'invalid' &&
        result.issues.some((issue) => issue.path === 'updated_at' && issue.reason === 'invariantViolation'),
    ).toBe(true);
  });
});

describe('mapNoteRowToDomainEntry: foreign user', () => {
  it('rejects a row belonging to a different user, as the only issue', () => {
    const result = mapNoteRowToDomainEntry(makeNoteRow({ user_id: OTHER_USER_ID }), USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues).toEqual([
      { path: 'user_id', reason: 'foreignUser', message: expect.any(String) },
    ]);
  });
});

describe('mapNoteRowsToDomainEntries', () => {
  it('returns a valid empty result for an empty row list', () => {
    const result = mapNoteRowsToDomainEntries([], USER_ID);
    expect(result).toEqual({ status: 'valid', entries: [] });
  });

  it('rejects two rows in the same batch sharing the same id', () => {
    const rowA = makeNoteRow({ id: 'dup-1' });
    const rowB = makeNoteRow({ id: 'dup-1' });
    const result = mapNoteRowsToDomainEntries([rowA, rowB], USER_ID);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.some((issue) => issue.reason === 'duplicateId')).toBe(true);
  });

  it('includes both active and tombstoned entries in one batch, without filtering', () => {
    const rowActive = makeNoteRow({ id: 'note-active' });
    const rowDeleted = makeNoteRow({ id: 'note-deleted', deleted_at: DELETED_TIMESTAMP });
    const result = mapNoteRowsToDomainEntries([rowActive, rowDeleted], USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entries.map((entry) => entry.status)).toEqual(['active', 'deleted']);
  });

  it('preserves input order', () => {
    const rowA = makeNoteRow({ id: 'note-a' });
    const rowB = makeNoteRow({ id: 'note-b' });
    const rowC = makeNoteRow({ id: 'note-c' });
    const result = mapNoteRowsToDomainEntries([rowC, rowA, rowB], USER_ID);
    expect(result.status).toBe('valid');
    expect(result.status === 'valid' && result.entries.map((entry) => entry.note.id)).toEqual([
      'note-c',
      'note-a',
      'note-b',
    ]);
  });
});

describe('mapNoteToInsertInput', () => {
  it('maps a note without practiceSessionId', () => {
    const note: Note = {
      id: 'note-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Getting the timing down.',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    };
    const input = mapNoteToInsertInput(note, USER_ID);
    expect(input).toEqual({
      user_id: USER_ID,
      id: 'note-1',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Getting the timing down.',
      practice_session_id: null,
    });
    expect(input).not.toHaveProperty('created_at');
    expect(input).not.toHaveProperty('updated_at');
    expect(input).not.toHaveProperty('revision');
    expect(input).not.toHaveProperty('deleted_at');
  });

  it('maps a note with practiceSessionId', () => {
    const note: Note = {
      id: 'note-2',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Nailed it during a Sesh.',
      practiceSessionId: '1000:5000:lighthouse',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    };
    const input = mapNoteToInsertInput(note, USER_ID);
    expect(input.practice_session_id).toBe('1000:5000:lighthouse');
  });
});

describe('prepareNoteDeletionPatch', () => {
  const activeEntry: NoteCloudEntry = {
    status: 'active',
    note: {
      id: 'note-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Getting the timing down.',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    },
    meta: { revision: 1 },
  };

  it('prepares a patch for an active entry with a sane revision', () => {
    const result = prepareNoteDeletionPatch(activeEntry, DELETED_TIMESTAMP_MS);
    expect(result).toEqual({ status: 'prepared', patch: { deleted_at: new Date(DELETED_TIMESTAMP_MS).toISOString() } });
  });

  it('rejects an already-deleted known entry (stale mutation)', () => {
    const deletedEntry: NoteCloudEntry = {
      status: 'deleted',
      note: activeEntry.note,
      meta: { revision: 1, deletedAt: DELETED_TIMESTAMP_MS },
    };
    const result = prepareNoteDeletionPatch(deletedEntry, DELETED_TIMESTAMP_MS + 1);
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: expect.any(String) },
    });
  });

  it.each([0, 1.5])('rejects a hand-constructed entry with a malformed revision (%s)', (revision) => {
    const malformedEntry: NoteCloudEntry = { status: 'active', note: activeEntry.note, meta: { revision } };
    const result = prepareNoteDeletionPatch(malformedEntry, DELETED_TIMESTAMP_MS);
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: expect.any(String) },
    });
  });
});

describe('prepareNoteEditPatch', () => {
  const activeEntry: NoteCloudEntry = {
    status: 'active',
    note: {
      id: 'note-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Getting the timing down.',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    },
    meta: { revision: 1 },
  };

  it('prepares a patch for an active entry with a non-blank body', () => {
    const result = prepareNoteEditPatch(activeEntry, 'Updated note body.');
    expect(result).toEqual({ status: 'prepared', patch: { body: 'Updated note body.' } });
  });

  it('rejects an already-deleted known entry (stale mutation)', () => {
    const deletedEntry: NoteCloudEntry = {
      status: 'deleted',
      note: activeEntry.note,
      meta: { revision: 1, deletedAt: DELETED_TIMESTAMP_MS },
    };
    const result = prepareNoteEditPatch(deletedEntry, 'Updated note body.');
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'alreadyDeleted', message: expect.any(String) },
    });
  });

  it.each([0, 1.5])('rejects a hand-constructed entry with a malformed revision (%s)', (revision) => {
    const malformedEntry: NoteCloudEntry = { status: 'active', note: activeEntry.note, meta: { revision } };
    const result = prepareNoteEditPatch(malformedEntry, 'Updated note body.');
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'invalidRevision', message: expect.any(String) },
    });
  });

  it.each(['', '   '])('rejects a blank/whitespace-only body (%j)', (body) => {
    const result = prepareNoteEditPatch(activeEntry, body);
    expect(result).toEqual({
      status: 'rejected',
      issue: { reason: 'malformedShape', message: expect.any(String) },
    });
  });
});

describe('no input mutation', () => {
  it('does not mutate a frozen Note passed to the domain -> insert mapper', () => {
    const note = deepFreeze<Note>({
      id: 'note-1',
      trickId: 'lighthouse',
      trickName: 'Lighthouse',
      body: 'Getting the timing down.',
      practiceSessionId: '1000:5000:lighthouse',
      createdAt: TIMESTAMP_MS,
      updatedAt: TIMESTAMP_MS,
    });
    const before = JSON.stringify(note);

    expect(() => mapNoteToInsertInput(note, USER_ID)).not.toThrow();

    expect(JSON.stringify(note)).toBe(before);
  });

  it('does not mutate a frozen NoteRow (active and tombstoned) passed to the row mappers', () => {
    const rowActive = deepFreeze<NoteRow>(makeNoteRow());
    const rowDeleted = deepFreeze<NoteRow>(makeNoteRow({ id: 'note-deleted', deleted_at: DELETED_TIMESTAMP }));
    const rows = deepFreeze<NoteRow[]>([rowActive, rowDeleted]);
    const activeBefore = JSON.stringify(rowActive);
    const deletedBefore = JSON.stringify(rowDeleted);
    const rowsBefore = JSON.stringify(rows);

    expect(() => mapNoteRowToDomainEntry(rowActive, USER_ID)).not.toThrow();
    expect(() => mapNoteRowToDomainEntry(rowDeleted, USER_ID)).not.toThrow();
    expect(() => mapNoteRowsToDomainEntries(rows, USER_ID)).not.toThrow();

    expect(JSON.stringify(rowActive)).toBe(activeBefore);
    expect(JSON.stringify(rowDeleted)).toBe(deletedBefore);
    expect(JSON.stringify(rows)).toBe(rowsBefore);
  });

  it('does not mutate a frozen NoteCloudEntry passed to the mutation-prep functions', () => {
    const entry = deepFreeze<NoteCloudEntry>({
      status: 'active',
      note: {
        id: 'note-1',
        trickId: 'lighthouse',
        trickName: 'Lighthouse',
        body: 'Getting the timing down.',
        createdAt: TIMESTAMP_MS,
        updatedAt: TIMESTAMP_MS,
      },
      meta: { revision: 1 },
    });
    const before = JSON.stringify(entry);

    expect(() => prepareNoteDeletionPatch(entry, DELETED_TIMESTAMP_MS)).not.toThrow();
    expect(() => prepareNoteEditPatch(entry, 'Updated body.')).not.toThrow();

    expect(JSON.stringify(entry)).toBe(before);
  });
});
