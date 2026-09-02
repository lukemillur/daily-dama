import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AllNotesScreen } from '@/features/notes/components/all-notes-screen';
import { NoteProvider, useNoteActions } from '@/features/notes/state/note-provider';

// NoteProvider persists through AsyncStorage. Mock the same way sibling screen tests do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function noop() {}

function Harness() {
  const { addNote } = useNoteActions();

  return (
    <>
      <Pressable
        accessibilityLabel="add-note-a"
        onPress={() => addNote({ trickId: 'big-cup', trickName: 'Big Cup', body: 'Keep wrist loose.' })}
      />
      <Pressable
        accessibilityLabel="add-note-orphaned"
        onPress={() =>
          addNote({
            trickId: 'deleted-custom-trick',
            trickName: 'Old Custom Trick',
            body: 'This trick no longer exists.',
          })
        }
      />
      <AllNotesScreen onBack={noop} />
    </>
  );
}

async function mountHarness() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NoteProvider>
        <Harness />
      </NoteProvider>,
    );
  });
  return root;
}

function press(root: ReactTestRenderer, label: string) {
  const [node] = root.root.findAll((candidate) => candidate.props.accessibilityLabel === label);
  act(() => {
    node.props.onPress();
  });
}

function findText(root: ReactTestRenderer, text: string) {
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.children === text,
  );
}

describe('AllNotesScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows the empty state when there are no notes', async () => {
    const root = await mountHarness();

    expect(findText(root, "No notes yet. Add one from a trick's Notes action.")).toHaveLength(1);
  });

  it('lists notes with their stored trick-name snapshot and body', async () => {
    const root = await mountHarness();

    press(root, 'add-note-a');

    expect(findText(root, 'Big Cup')).toHaveLength(1);
    expect(findText(root, 'Keep wrist loose.')).toHaveLength(1);
  });

  it('keeps orphaned notes visible and manageable after their source trick is gone', async () => {
    const root = await mountHarness();

    press(root, 'add-note-orphaned');

    expect(findText(root, 'Old Custom Trick')).toHaveLength(1);
    expect(findText(root, 'This trick no longer exists.')).toHaveLength(1);

    const [editAction] = root.root.findAll((node) => node.props.accessibilityLabel === 'Edit note');
    act(() => {
      editAction.props.onPress();
    });
    expect(findText(root, 'Edit note')).toHaveLength(1);
  });

  it('edits a note in place', async () => {
    const root = await mountHarness();

    press(root, 'add-note-a');

    const [editAction] = root.root.findAll((node) => node.props.accessibilityLabel === 'Edit note');
    act(() => {
      editAction.props.onPress();
    });

    const [input] = root.root.findAllByType(TextInput);
    act(() => {
      input.props.onChangeText('Updated note body.');
    });

    const [saveButton] = root.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function' &&
        node.findAll((descendant) => descendant.props.children === 'Save note').length > 0,
    );
    act(() => {
      saveButton.props.onPress();
    });

    expect(findText(root, 'Updated note body.')).toHaveLength(1);
  });

  it('removes a note from the list once deleted', async () => {
    const root = await mountHarness();

    press(root, 'add-note-a');
    expect(findText(root, 'Big Cup')).toHaveLength(1);

    const [deleteAction] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Delete note',
    );
    act(() => {
      deleteAction.props.onPress();
    });

    const [confirmDelete] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Confirm delete note',
    );
    act(() => {
      confirmDelete.props.onPress();
    });

    expect(findText(root, 'Big Cup')).toHaveLength(0);
  });
  it("renders hostile note-body markup as literal text, not executable HTML (T162.1)", async () => {
    const root = await mountHarness();
    const hostileBody = `<img src=x onerror="window.__pwned=1">`;

    const [addAction] = root.root.findAll(
      (node) => node.props.accessibilityLabel === "add-note-a",
    );
    act(() => {
      addAction.props.onPress();
    });

    const [editAction] = root.root.findAll(
      (node) => node.props.accessibilityLabel === "Edit note",
    );
    act(() => {
      editAction.props.onPress();
    });
    const [input] = root.root.findAllByType(TextInput);
    act(() => {
      input.props.onChangeText(hostileBody);
    });
    const [saveButton] = root.root.findAll(
      (node) =>
        node.props.accessibilityRole === "button" &&
        typeof node.props.onPress === "function" &&
        node.findAll((descendant) => descendant.props.children === "Save note").length > 0,
    );
    act(() => {
      saveButton.props.onPress();
    });

    expect(findText(root, hostileBody)).toHaveLength(1);
  });
});
