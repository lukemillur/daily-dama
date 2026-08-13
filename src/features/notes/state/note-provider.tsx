import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import {
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
import { createWriteQueue } from '@/shared/persistence/storage';

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

export function NoteProvider({ children }: PropsWithChildren) {
  const [collection, dispatch] = useReducer(noteReducer, INITIAL_NOTES);
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (nextCollection: NoteCollection) => {
      const result = await saveNotes(AsyncStorage, nextCollection);
      if (result.status === 'failed') {
        console.warn('Unable to persist notes.', result.error);
      }
    }),
  );

  useEffect(() => {
    let isCurrent = true;

    loadNotes(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore notes. Using an empty collection.', result.error);
      }

      dispatch({ type: 'notesRestored', collection: result.value });
      setHasHydrated(true);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (shouldSkipInitialWrite.current) {
      shouldSkipInitialWrite.current = false;
      return;
    }

    void enqueueWrite(collection);
  }, [collection, enqueueWrite, hasHydrated]);

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
      <NoteActionsContext.Provider value={actions}>{children}</NoteActionsContext.Provider>
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
