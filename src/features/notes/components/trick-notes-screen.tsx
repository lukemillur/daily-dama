import { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { selectNotesForTrick, type Note } from '@/features/notes/model/note';
import { useNoteActions, useNotes } from '@/features/notes/state/note-provider';
import { formatPracticeDate } from '@/features/stats/model/format-practice-date';

interface TrickNotesScreenProps {
  readonly trickId: string;
  readonly trickName: string;
  readonly onBack: () => void;
}

type ScreenStep = { readonly kind: 'list' } | { readonly kind: 'add' } | { readonly kind: 'edit'; readonly note: Note };

export function TrickNotesScreen({ trickId, trickName, onBack }: TrickNotesScreenProps) {
  const { notes } = useNotes();
  const { addNote } = useNoteActions();
  const [step, setStep] = useState<ScreenStep>({ kind: 'list' });
  const trickNotes = useMemo(() => selectNotesForTrick(notes, trickId), [notes, trickId]);

  if (step.kind === 'add') {
    return (
      <NoteForm
        onCancel={() => setStep({ kind: 'list' })}
        onSave={(body) => {
          const result = addNote({ trickId, trickName, body });
          if (result.status === 'saved') setStep({ kind: 'list' });
        }}
        title="New note"
      />
    );
  }

  if (step.kind === 'edit') {
    return (
      <NoteForm
        initialBody={step.note.body}
        note={step.note}
        onCancel={onBack}
        onSaved={() => setStep({ kind: 'list' })}
        title="Edit note"
      />
    );
  }

  return (
    <Scroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <Content>
        <Eyebrow>Notes</Eyebrow>
        <PageTitle>{trickName}</PageTitle>
        <Introduction>
          {trickNotes.length === 0
            ? 'Nothing written yet. Capture what you notice while it is fresh.'
            : `${trickNotes.length} ${trickNotes.length === 1 ? 'note' : 'notes'} for this trick.`}
        </Introduction>

        <AddButton size="medium" onPress={() => setStep({ kind: 'add' })}>
          Add note
        </AddButton>

        <NoteList>
          {trickNotes.map((note) => (
            <NoteRow key={note.id} note={note} onEdit={() => setStep({ kind: 'edit', note })} />
          ))}
        </NoteList>

        <FormActions>
          <Button accessibilityLabel="Back to Tricks" fill variant="secondary" onPress={onBack}>
            Back to Tricks
          </Button>
        </FormActions>
      </Content>
    </Scroll>
  );
}

function NoteRow({ note, onEdit }: { readonly note: Note; readonly onEdit: () => void }) {
  const { deleteNote } = useNoteActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete) {
    return (
      <NoteCard>
        <NoteHeaderRow>
          <NoteMeta>{formatPracticeDate(note.createdAt)}</NoteMeta>
          <NoteTrickName numberOfLines={2}>{note.trickName}</NoteTrickName>
        </NoteHeaderRow>
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

  return (
    <NoteCard>
      <NoteHeaderRow>
        <NoteMeta>{formatPracticeDate(note.createdAt)}</NoteMeta>
        <NoteTrickName numberOfLines={2}>{note.trickName}</NoteTrickName>
      </NoteHeaderRow>
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

function NoteForm({
  initialBody = '',
  note,
  onCancel,
  onSaved,
  onSave,
  title,
}: {
  readonly initialBody?: string;
  readonly note?: Note;
  readonly onCancel: () => void;
  readonly onSaved?: () => void;
  readonly onSave?: (body: string) => void;
  readonly title: string;
}) {
  const { updateNote } = useNoteActions();
  const [body, setBody] = useState(initialBody);
  const trimmedIsEmpty = body.trim().length === 0;

  const save = () => {
    if (note) {
      const result = updateNote(note.id, { body });
      if (result.status === 'saved') onSaved?.();
      return;
    }
    onSave?.(body);
  };

  return (
    <Scroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <Content>
        <Eyebrow>{title}</Eyebrow>
        <PageTitle>Write it down.</PageTitle>
        <TextField
          accessibilityLabel="Note body"
          label="Note"
          multiline
          onChangeText={setBody}
          placeholder="What did you notice?"
          style={NOTE_INPUT_STYLE}
          value={body}
        />
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
const AddButton = styled(Button)`align-self: flex-start; margin-top: 26px;`;
const NoteList = styled.View`gap: 12px; margin-top: 28px;`;
const NoteCard = styled.View`background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; padding: 16px;`;
const NoteHeaderRow = styled.View`flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 14px;`;
const NoteMeta = styled.Text`color: ${AppColors.red}; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const NoteTrickName = styled(DisplayTitle)`
  flex-shrink: 1;
  font-size: 28px;
  line-height: 30px;
  text-align: right;
`;
const NoteBody = styled.Text`color: ${AppColors.ink}; font-size: 16px; font-weight: 650; line-height: 23px; margin-top: 8px;`;
const NoteActions = styled.View`flex-direction: row; gap: 14px; margin-top: 12px;`;
const NoteAction = styled(Pressable)`min-height: 36px; justify-content: center;`;
const NoteActionText = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900; text-transform: uppercase;`;
const DeleteActionText = styled(NoteActionText)`color: ${AppColors.red};`;
const FormActions = styled.View`gap: 10px; margin-top: 36px;`;
const NOTE_INPUT_STYLE = { minHeight: 160, textAlignVertical: 'top' as const };
