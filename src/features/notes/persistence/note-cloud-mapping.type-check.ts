// Compile-time-only proof that the mapping layer's discriminated
// union types leave no ambiguous empty-object stand-in for "invalid" vs
// "valid" branches, that `'active'`/`'deleted'` `NoteCloudEntry` variants
// gate `meta.deletedAt` access correctly, and that the insert mapper's
// return shape omits server-owned columns legitimately. Deliberately NOT
// named `*.test.ts` and NOT under `__tests__/`, so jest never collects it
// but `yarn tsc --noEmit` still type-checks it via tsconfig.json's
// `**/*.ts` include. This file has no runtime behavior.

import type { Note } from '@/features/notes/model/note';
import type {
  NoteCloudEntry,
  NoteRowMappingResult,
  NoteRowsMappingResult,
} from '@/features/notes/persistence/note-cloud-mapping';
import type { NoteInsert } from '@/features/notes/persistence/note-cloud-repository';

declare const rowResult: NoteRowMappingResult;
declare const rowsResult: NoteRowsMappingResult;
declare const entry: NoteCloudEntry;

// --- invalid branch must not expose the success payload ---------------------

if (rowResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `entry` property, only
  // `issues`.
  rowResult.entry;
}

if (rowResult.status === 'valid') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const validEntry: NoteCloudEntry = rowResult.entry;
  void validEntry;
}

if (rowsResult.status === 'invalid') {
  // @ts-expect-error -- the `invalid` branch has no `entries` property, only
  // `issues`.
  rowsResult.entries;
}

if (rowsResult.status === 'valid') {
  const { entries } = rowsResult;
  void entries;
}

// --- 'active' vs 'deleted' entry meta gating --------------------------------

if (entry.status === 'active') {
  // @ts-expect-error -- an 'active' entry's meta has no `deletedAt`.
  entry.meta.deletedAt;
}

if (entry.status === 'deleted') {
  // Only reachable in this branch -- narrowing on `status` is required.
  const deletedAt: number = entry.meta.deletedAt;
  void deletedAt;
}

// --- no ambiguous empty-object fallback for discriminated union members ----

// @ts-expect-error -- id/trickId/trickName/body/createdAt/updatedAt are all
// required; an empty object cannot stand in for a valid Note.
const emptyNote: Note = {};
void emptyNote;

// @ts-expect-error -- required insert fields are missing.
const emptyInsert: NoteInsert = {};
void emptyInsert;

// Confirm revision/created_at/updated_at/deleted_at/practice_session_id are
// specifically the fields that are optional/server-owned -- omitting
// revision/created_at/updated_at/deleted_at from an otherwise-complete
// insert input still type-checks. This is what proves
// `mapNoteToInsertInput`'s return value (which never sets any of them) is a
// legitimate `NoteInsert`.
const insertWithoutServerOwnedFields: Omit<NoteInsert, 'revision' | 'created_at' | 'updated_at' | 'deleted_at'> = {
  user_id: 'user-1',
  id: 'note-1',
  trick_id: 'lighthouse',
  trick_name: 'Lighthouse',
  body: 'Getting the timing down.',
  practice_session_id: null,
};
const insertWithServerOwnedFieldsOmitted: NoteInsert = insertWithoutServerOwnedFields;
void insertWithServerOwnedFieldsOmitted;
