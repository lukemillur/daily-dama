import { describe, expect, it } from '@jest/globals';

import {
  createCustomTrick,
  customTrickReducer,
  INITIAL_CUSTOM_TRICKS,
} from '@/features/custom-tricks/model/custom-trick';
import {
  createNote,
  createNoteId,
  INITIAL_NOTES,
  noteReducer,
  selectNotesForTrick,
  validateNoteCreation,
  validateNoteEdit,
} from '@/features/notes/model/note';

describe('notes', () => {
  it('creates a trick-only note storing the trick id and name snapshot, omitting a sesh reference', () => {
    const validation = validateNoteCreation({
      trickId: 'custom-source',
      trickName: 'Stilt flip',
      body: '  Landed it clean today.  ',
    });

    expect(validation).toEqual({
      status: 'valid',
      value: { trickId: 'custom-source', trickName: 'Stilt flip', body: 'Landed it clean today.' },
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');

    const note = createNote(createNoteId(1_000, 0.5), validation.value, 1_000);
    expect(note).toEqual({
      id: createNoteId(1_000, 0.5),
      trickId: 'custom-source',
      trickName: 'Stilt flip',
      body: 'Landed it clean today.',
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(note).not.toHaveProperty('practiceSessionId');
  });

  it('creates a sesh-linked note storing the practice-history record id', () => {
    const validation = validateNoteCreation({
      trickId: 'big-cup',
      trickName: 'Big cup',
      body: 'Struggled with the catch.',
      practiceSessionId: 'session-42',
    });

    expect(validation).toEqual({
      status: 'valid',
      value: {
        trickId: 'big-cup',
        trickName: 'Big cup',
        body: 'Struggled with the catch.',
        practiceSessionId: 'session-42',
      },
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');

    const note = createNote('note-1', validation.value, 2_000);
    expect(note.practiceSessionId).toBe('session-42');
  });

  it('rejects a note without a trick id, trick name, or body', () => {
    expect(validateNoteCreation({ trickId: '', trickName: 'Big cup', body: 'Body' }).status).toBe(
      'invalid',
    );
    expect(validateNoteCreation({ trickId: 'big-cup', trickName: ' ', body: 'Body' }).status).toBe(
      'invalid',
    );
    expect(validateNoteCreation({ trickId: 'big-cup', trickName: 'Big cup', body: '   ' }).status).toBe(
      'invalid',
    );
  });

  it('edits a note by replacing its trimmed body', () => {
    expect(validateNoteEdit({ body: '  Updated thought.  ' })).toEqual({
      status: 'valid',
      value: { body: 'Updated thought.' },
    });
    expect(validateNoteEdit({ body: '   ' }).status).toBe('invalid');
  });

  it('adds a note once for a stable identifier', () => {
    const note = createNote('note-1', { trickId: 'big-cup', trickName: 'Big cup', body: 'Body' }, 1);
    const once = noteReducer(INITIAL_NOTES, { type: 'noteAdded', note });
    const twice = noteReducer(once, { type: 'noteAdded', note });

    expect(once.notes).toEqual([note]);
    expect(twice).toBe(once);
  });

  it('updates a note when its id is found, and no-ops when it is missing', () => {
    const note = createNote('note-1', { trickId: 'big-cup', trickName: 'Big cup', body: 'Body' }, 1);
    const state = { notes: [note] };
    const updatedNote = { ...note, body: 'New body', updatedAt: 2 };

    const updated = noteReducer(state, { type: 'noteUpdated', note: updatedNote });
    expect(updated.notes).toEqual([updatedNote]);

    const missing = noteReducer(state, {
      type: 'noteUpdated',
      note: { ...note, id: 'note-missing' },
    });
    expect(missing).toBe(state);
  });

  it('deletes a note when its id is found, and no-ops when it is missing', () => {
    const first = createNote('note-1', { trickId: 'big-cup', trickName: 'Big cup', body: 'A' }, 1);
    const second = createNote('note-2', { trickId: 'big-cup', trickName: 'Big cup', body: 'B' }, 2);
    const state = { notes: [first, second] };

    expect(noteReducer(state, { type: 'noteDeleted', noteId: first.id }).notes).toEqual([second]);
    expect(noteReducer(state, { type: 'noteDeleted', noteId: 'missing' })).toBe(state);
  });

  it('sorts notes for a trick by createdAt descending', () => {
    const older = createNote('note-1', { trickId: 'big-cup', trickName: 'Big cup', body: 'Older' }, 1);
    const newer = createNote('note-2', { trickId: 'big-cup', trickName: 'Big cup', body: 'Newer' }, 2);
    const other = createNote('note-3', { trickId: 'other-trick', trickName: 'Other', body: 'Other' }, 3);

    expect(selectNotesForTrick([older, newer, other], 'big-cup')).toEqual([newer, older]);
  });

  it('leaves a note unchanged when its source custom trick is later renamed or deleted', () => {
    const customTrick = createCustomTrick('custom-source', { kind: 'standalone', name: 'Stilt flip' });
    const customTrickState = customTrickReducer(INITIAL_CUSTOM_TRICKS, {
      type: 'customTrickAdded',
      trick: customTrick,
    });

    const validation = validateNoteCreation({
      trickId: customTrick.id,
      trickName: customTrick.name,
      body: 'Great progress.',
    });
    if (validation.status !== 'valid') throw new Error('Expected a valid draft.');
    const note = createNote('note-1', validation.value, 1);
    const noteState = noteReducer(INITIAL_NOTES, { type: 'noteAdded', note });

    const renamedCustomTrickState = customTrickReducer(customTrickState, {
      type: 'customTrickUpdated',
      trick: { ...customTrick, name: 'Renamed trick' },
    });
    const deletedCustomTrickState = customTrickReducer(renamedCustomTrickState, {
      type: 'customTrickDeleted',
      trickId: customTrick.id,
    });

    expect(deletedCustomTrickState.tricks).toEqual([]);
    expect(noteState.notes).toEqual([note]);
    expect(noteState.notes[0]).toBe(note);
    expect(noteState.notes[0]?.trickName).toBe('Stilt flip');
  });
});
