import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrickNotesScreen } from '@/features/notes/components/trick-notes-screen';
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
        accessibilityLabel="add-note"
        onPress={() => addNote({ trickId: 'big-cup', trickName: 'Big Cup', body: 'Keep wrist loose.' })}
      />
      <TrickNotesScreen onBack={noop} trickId="big-cup" trickName="Big Cup" />
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
  return root.root.findAll((node) => typeof node.type === 'string' && node.props.children === text);
}

describe('TrickNotesScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("renders a note card's trick-name snapshot as a large title on the right side of the card", async () => {
    const root = await mountHarness();

    press(root, 'add-note');

    const matches = findText(root, 'Big Cup');
    // Both the screen's own PageTitle and the note card's title render the same trickName text.
    expect(matches.length).toBeGreaterThanOrEqual(2);

    const cardTitleNode = matches.find(
      (node) => Array.isArray(node.props.style)
        ? node.props.style.some((entry) => entry && entry.textAlign === 'right')
        : node.props.style?.textAlign === 'right',
    );
    expect(cardTitleNode).toBeDefined();
    const styleEntries = Array.isArray(cardTitleNode!.props.style)
      ? cardTitleNode!.props.style
      : [cardTitleNode!.props.style];
    const mergedStyle = Object.assign({}, ...styleEntries);
    expect(mergedStyle).toMatchObject({ textAlign: 'right' });
    expect(mergedStyle.fontSize).toBeGreaterThanOrEqual(24);
  });
});
