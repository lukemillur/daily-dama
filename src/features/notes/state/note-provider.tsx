import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import {
  type NoteAction,
  createNote,
  createNoteId,
  INITIAL_NOTES,
  type Note,
  type NoteCollection,
  type NoteCreationInput,
  type NoteDraftErrors,
  type NoteEditDraft,
  noteReducer,
  validateNoteCreation,
  validateNoteEdit,
} from '@/features/notes/model/note';
import { loadNotes, saveNotes } from '@/features/notes/persistence/note-persistence';
import { createNoteSyncTransportAdapter } from '@/features/notes/persistence/note-sync-transport';
import { useNoteDomainSync } from '@/features/notes/state/use-note-domain-sync';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import type { LocalDurabilityStatus } from '@/shared/persistence/storage';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import type { DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import type { DomainDiscardOutcome } from '@/shared/sync/discard-outcome';

type SaveNoteResult =
  | { readonly status: 'invalid'; readonly errors: NoteDraftErrors }
  | { readonly status: 'saved'; readonly note: Note };

interface NoteActions {
  readonly addNote: (input: NoteCreationInput) => SaveNoteResult;
  readonly updateNote: (noteId: string, draft: NoteEditDraft) => SaveNoteResult;
  readonly deleteNote: (noteId: string) => void;
}

const NoteStateContext = createContext<NoteCollection | undefined>(undefined);
const NoteActionsContext = createContext<NoteActions | undefined>(undefined);

export interface NoteSync {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly discardPending: () => Promise<DomainDiscardOutcome>;
}

const NoteSyncContext = createContext<NoteSync | undefined>(undefined);

// Runtime-only local-durability status, distinct from the cloud-facing
// NoteSync context above -- see `LocalDurabilityStatus`'s doc comment.
const NoteDurabilityContext = createContext<LocalDurabilityStatus<NoteCollection> | undefined>(
  undefined,
);

export function NoteProvider({ children }: PropsWithChildren) {
  const { state: collection, dispatch, hasHydrated, durability } = useIdentityScopedDomain({
    reducer: noteReducer,
    initialState: INITIAL_NOTES,
    load: loadNotes,
    save: saveNotes,
    createRestoreAction: (value: NoteCollection): NoteAction => ({
      type: 'notesRestored',
      collection: value,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore notes. Using an empty collection.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist notes.', error);
    },
  });

  // Additive: a second, parallel identity-scoped domain instance tracking
  // sync bookkeeping. The primary reducer above stays completely
  // untouched and remains the sole source of truth for the rendered
  // `NoteCollection` -- this hook only pulls/pushes in the background and,
  // on a safe pull-adopt, dispatches the same `notesRestored` action
  // hydration itself uses.
  const { identity } = useIdentityHandle();
  const getTransport = useCallback(() => {
    if (identity.kind !== 'user') return undefined;
    const client = getSupabaseClient();
    if (client === null) return undefined;
    return createNoteSyncTransportAdapter(client, identity.userId);
  }, [identity]);

  const sync = useNoteDomainSync({
    collection,
    hasHydratedCollection: hasHydrated,
    dispatchCollection: dispatch,
    getTransport,
  });

  const addNote = useCallback((input: NoteCreationInput): SaveNoteResult => {
    const validation = validateNoteCreation(input);
    if (validation.status === 'invalid') return validation;

    const note = createNote(createNoteId(), validation.value);
    dispatch({ type: 'noteAdded', note });
    return { status: 'saved', note };
  }, []);

  const updateNote = useCallback(
    (noteId: string, draft: NoteEditDraft): SaveNoteResult => {
      const validation = validateNoteEdit(draft);
      if (validation.status === 'invalid') return validation;

      const existing = collection.notes.find((note) => note.id === noteId);
      if (!existing) return { status: 'invalid', errors: { body: 'This note no longer exists.' } };

      const note: Note = { ...existing, body: validation.value.body, updatedAt: Date.now() };
      dispatch({ type: 'noteUpdated', note });
      return { status: 'saved', note };
    },
    [collection.notes],
  );

  const deleteNote = useCallback((noteId: string) => {
    dispatch({ type: 'noteDeleted', noteId });
  }, []);

  const actions = useMemo(
    () => ({ addNote, deleteNote, updateNote }),
    [addNote, deleteNote, updateNote],
  );

  if (!hasHydrated) {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.wordmark}>Daily Dama</Text>
        <Text style={styles.message}>Loading your tricks...</Text>
      </View>
    );
  }

  return (
    <NoteStateContext.Provider value={collection}>
      <NoteActionsContext.Provider value={actions}>
        <NoteSyncContext.Provider value={sync}>
          <NoteDurabilityContext.Provider value={durability}>{children}</NoteDurabilityContext.Provider>
        </NoteSyncContext.Provider>
      </NoteActionsContext.Provider>
    </NoteStateContext.Provider>
  );
}

export function useNotes() {
  const collection = useContext(NoteStateContext);
  if (!collection) throw new Error('useNotes must be used within NoteProvider.');
  return collection;
}

export function useNoteActions() {
  const actions = useContext(NoteActionsContext);
  if (!actions) throw new Error('useNoteActions must be used within NoteProvider.');
  return actions;
}

// Exposed for a future manual-retry affordance and for tests --
// deliberately no UI consumes this yet.
export function useNoteSync(): NoteSync {
  const sync = useContext(NoteSyncContext);
  if (!sync) throw new Error('useNoteSync must be used within NoteProvider.');
  return sync;
}

export function useNoteDurability(): LocalDurabilityStatus<NoteCollection> {
  const durability = useContext(NoteDurabilityContext);
  if (!durability) {
    throw new Error('useNoteDurability must be used within NoteProvider.');
  }
  return durability;
}

const styles = StyleSheet.create({
  hydrationFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.yellow,
  },
  wordmark: {
    color: AppColors.ink,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  message: {
    color: AppColors.inkSoft,
    fontSize: 14,
    fontWeight: 700,
    marginTop: 8,
  },
});
