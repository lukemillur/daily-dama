import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NoteCollection } from '@/features/notes/model/note';
import { NOTES_STORAGE_KEY } from '@/features/notes/persistence/note-persistence';
import { NoteProvider, useNoteActions, useNoteDurability } from '@/features/notes/state/note-provider';
import type { LocalDurabilityStatus, ScopedSaveOutcome } from '@/shared/persistence/storage';

// Same canonical shape as goal-provider.durability.test.tsx -- see .claude/plans/T248.1.md.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

interface Captured {
  durability?: LocalDurabilityStatus<NoteCollection>;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const durability = useNoteDurability();
    const { addNote } = useNoteActions();

    useEffect(() => {
      captured.durability = durability;
    });

    return (
      <Text
        accessibilityLabel="add-note"
        onPress={() => addNote({ trickId: 'big-cup', trickName: 'Big Cup', body: 'Notes body' })}
      >
        {JSON.stringify(durability)}
      </Text>
    );
  };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

describe('NoteProvider durability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes a failed durability status with the current snapshot after a local save failure', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key) => {
      if (key.includes(NOTES_STORAGE_KEY)) {
        throw new Error('disk full');
      }
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <Harness />
        </NoteProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-note');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.durability?.status).toBe('failed');
    if (captured.durability?.status === 'failed') {
      expect(captured.durability.snapshot.notes).toHaveLength(1);
      expect(captured.durability.snapshot.notes[0]?.trickId).toBe('big-cup');
      expect(typeof captured.durability.retry).toBe('function');
    }

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });

  it('retry() clears the failure once the underlying write can succeed', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key) => {
      if (key.includes(NOTES_STORAGE_KEY)) throw new Error('disk full');
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <Harness />
        </NoteProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-note');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.durability?.status).toBe('failed');

    let retryOutcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      if (captured.durability?.status === 'failed') {
        retryOutcome = await captured.durability.retry();
      }
    });

    expect(retryOutcome).toEqual({ status: 'saved' });
    expect(captured.durability).toEqual({ status: 'saved' });

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });
});
