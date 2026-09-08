export interface Note {
  readonly id: string;
  readonly trickId: string;
  readonly trickName: string;
  readonly body: string;
  readonly practiceSessionId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface NoteCollection {
  readonly notes: readonly Note[];
}

export const INITIAL_NOTES: NoteCollection = { notes: [] };

export interface NoteCreationInput {
  readonly trickId: string;
  readonly trickName: string;
  readonly body: string;
  readonly practiceSessionId?: string;
}

export interface NoteEditDraft {
  readonly body: string;
}

export interface NoteDraftErrors {
  readonly trickId?: string;
  readonly trickName?: string;
  readonly body?: string;
}

export type NoteCreationValidation =
  | { readonly status: 'invalid'; readonly errors: NoteDraftErrors }
  | { readonly status: 'valid'; readonly value: NoteCreationInput };

export type NoteEditValidation =
  | { readonly status: 'invalid'; readonly errors: NoteDraftErrors }
  | { readonly status: 'valid'; readonly value: NoteEditDraft };

export function validateNoteCreation(input: NoteCreationInput): NoteCreationValidation {
  const trickId = input.trickId.trim();
  const trickName = input.trickName.trim();
  const body = input.body.trim();
  const errors: { trickId?: string; trickName?: string; body?: string } = {};

  if (trickId.length === 0) errors.trickId = 'A note needs a trick to attach to.';
  if (trickName.length === 0) errors.trickName = 'A note needs a trick name snapshot.';
  if (body.length === 0) errors.body = 'Enter a note.';

  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const practiceSessionId = input.practiceSessionId?.trim();
  return {
    status: 'valid',
    value: {
      trickId,
      trickName,
      body,
      ...(practiceSessionId ? { practiceSessionId } : {}),
    },
  };
}

export function validateNoteEdit(draft: NoteEditDraft): NoteEditValidation {
  const body = draft.body.trim();
  if (body.length === 0) return { status: 'invalid', errors: { body: 'Enter a note.' } };
  return { status: 'valid', value: { body } };
}

export function createNoteId(now = Date.now(), random = Math.random()) {
  return `note-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export function createNote(id: string, input: NoteCreationInput, createdAt: number = Date.now()): Note {
  return {
    id,
    trickId: input.trickId,
    trickName: input.trickName,
    body: input.body,
    ...(input.practiceSessionId ? { practiceSessionId: input.practiceSessionId } : {}),
    createdAt,
    updatedAt: createdAt,
  };
}

export type NoteAction =
  | { readonly type: 'notesRestored'; readonly collection: NoteCollection }
  | { readonly type: 'noteAdded'; readonly note: Note }
  | { readonly type: 'noteUpdated'; readonly note: Note }
  | { readonly type: 'noteDeleted'; readonly noteId: string };

export function noteReducer(state: NoteCollection, action: NoteAction): NoteCollection {
  switch (action.type) {
    case 'notesRestored':
      return action.collection;
    case 'noteAdded':
      return state.notes.some((note) => note.id === action.note.id)
        ? state
        : { notes: [...state.notes, action.note] };
    case 'noteUpdated': {
      const index = state.notes.findIndex((note) => note.id === action.note.id);
      if (index === -1) return state;
      return {
        notes: state.notes.map((note) => (note.id === action.note.id ? action.note : note)),
      };
    }
    case 'noteDeleted':
      return state.notes.some((note) => note.id === action.noteId)
        ? { notes: state.notes.filter((note) => note.id !== action.noteId) }
        : state;
  }
}

export function selectNotesForTrick(notes: readonly Note[], trickId: string): readonly Note[] {
  return notes
    .filter((note) => note.trickId === trickId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function selectAllNotesSorted(notes: readonly Note[]): readonly Note[] {
  return notes.slice().sort((a, b) => b.createdAt - a.createdAt);
}
