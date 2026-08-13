import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import { selectAllNotesSorted, type Note } from '@/features/notes/model/note';
import { useNoteActions, useNotes } from '@/features/notes/state/note-provider';
import { formatPracticeDate } from '@/app/stats/index';

interface AllNotesScreenProps {
  readonly onClose: () => void;
}

export function AllNotesScreen({ onClose }: AllNotesScreenProps) {
  const { notes } = useNotes();
  const [editingNote, setEditingNote] = useState<Note | undefined>(undefined);
  const sortedNotes = useMemo(() => selectAllNotesSorted(notes), [notes]);

  if (editingNote) {
    return (
      <NoteEditForm
        note={editingNote}
        onCancel={() => setEditingNote(undefined)}
        onSaved={() => setEditingNote(undefined)}
      />
    );
  }

  return (
    <Scroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>All notes</Eyebrow>
        <PageTitle>All notes</PageTitle>
        <Introduction>
          {sortedNotes.length === 0
            ? "No notes yet. Add one from a trick's Notes action."
            : `${sortedNotes.length} ${sortedNotes.length === 1 ? 'note' : 'notes'} across your tricks.`}
        </Introduction>

        <FormActions>
          <Button fill variant="secondary" onPress={onClose}>
            Close
          </Button>
        </FormActions>

        <NoteList>
          {sortedNotes.map((note) => (
            <AllNotesRow key={note.id} note={note} onEdit={() => setEditingNote(note)} />
          ))}
        </NoteList>
      </Content>
    </Scroll>
  );
}

function AllNotesRow({ note, onEdit }: { readonly note: Note; readonly onEdit: () => void }) {
  const { deleteNote } = useNoteActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete) {
    return (
      <NoteCard>
        <NoteBody>Delete this note? This cannot be undone.</NoteBody>
        <NoteActions>
          <NoteAction
            accessibilityLabel="Confirm delete note"
            accessibilityRole="button"
            onPress={() => {
              deleteNote(note.id);
              setConfirmingDelete(false);
            }}>
            <DeleteActionText>Delete</DeleteActionText>
          </NoteAction>
          <NoteAction
            accessibilityLabel="Cancel delete note"
            accessibilityRole="button"
            onPress={() => setConfirmingDelete(false)}>
            <NoteActionText>Cancel</NoteActionText>
          </NoteAction>
        </NoteActions>
      </NoteCard>
    );
  }

  const edited = note.updatedAt !== note.createdAt;

  return (
    <NoteCard>
      <NoteMeta>{note.trickName}</NoteMeta>
      <NoteDate>
        {edited
          ? `Edited ${formatPracticeDate(note.updatedAt)} · added ${formatPracticeDate(note.createdAt)}`
          : `Added ${formatPracticeDate(note.createdAt)}`}
      </NoteDate>
      <NoteBody>{note.body}</NoteBody>
      <NoteActions>
        <NoteAction accessibilityLabel="Edit note" accessibilityRole="button" onPress={onEdit}>
          <NoteActionText>Edit</NoteActionText>
        </NoteAction>
        <NoteAction
          accessibilityLabel="Delete note"
          accessibilityRole="button"
          onPress={() => setConfirmingDelete(true)}>
          <DeleteActionText>Delete</DeleteActionText>
        </NoteAction>
      </NoteActions>
    </NoteCard>
  );
}

function NoteEditForm({
  note,
  onCancel,
  onSaved,
}: {
  readonly note: Note;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}) {
  const { updateNote } = useNoteActions();
  const [body, setBody] = useState(note.body);
  const trimmedIsEmpty = body.trim().length === 0;

  const save = () => {
    const result = updateNote(note.id, { body });
    if (result.status === 'saved') onSaved();
  };

  return (
    <Scroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <Content>
        <Eyebrow>Edit note</Eyebrow>
        <PageTitle>{note.trickName}</PageTitle>
        <Field>
          <FieldLabel>Note</FieldLabel>
          <FieldInput
            accessibilityLabel="Note body"
            multiline
            onChangeText={setBody}
            placeholder="What did you notice?"
            placeholderTextColor={AppColors.textSubtle}
            value={body}
          />
        </Field>
        <FormActions>
          <Button fill disabled={trimmedIsEmpty} onPress={save}>
            Save note
          </Button>
          <Button fill variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

const Scroll = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 680px; align-self: center; padding: 38px 22px 0;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px;`;
const Introduction = styled(BodyText)`max-width: 580px; margin-top: 16px;`;
const FormActions = styled.View`gap: 10px; margin-top: 26px;`;
const NoteList = styled.View`gap: 12px; margin-top: 30px;`;
const NoteCard = styled.View`background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; padding: 16px;`;
const NoteMeta = styled.Text`color: ${AppColors.red}; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const NoteDate = styled.Text`color: ${AppColors.textMuted}; font-size: 11px; font-weight: 700; margin-top: 4px;`;
const NoteBody = styled.Text`color: ${AppColors.ink}; font-size: 16px; font-weight: 650; line-height: 23px; margin-top: 8px;`;
const NoteActions = styled.View`flex-direction: row; gap: 14px; margin-top: 12px;`;
const NoteAction = styled(Pressable)`min-height: 36px; justify-content: center;`;
const NoteActionText = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900; text-transform: uppercase;`;
const DeleteActionText = styled(NoteActionText)`color: ${AppColors.red};`;
const Field = styled.View`margin-top: 28px;`;
const FieldLabel = styled.Text`color: ${AppColors.ink}; font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const FieldInput = styled(TextInput)`min-height: 160px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 16px; font-weight: 650; margin-top: 8px; padding: 12px 14px; text-align-vertical: top;`;
