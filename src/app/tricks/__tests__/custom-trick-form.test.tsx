import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CustomTrickForm } from '@/app/tricks';
import {
  type CustomTrick,
  type CustomTrickDraft,
  type CustomTrickDraftValidation,
  validateCustomTrickDraft,
} from '@/features/custom-tricks/model/custom-trick';

type MockSaveResult = CustomTrickDraftValidation | { status: 'saved'; trick: CustomTrick };

const mockAddCustomTrick = jest.fn<(draft: CustomTrickDraft) => MockSaveResult>();
const mockUpdateCustomTrick = jest.fn<(id: string, draft: CustomTrickDraft) => MockSaveResult>();
const mockToggleSelectedTrick = jest.fn();
const mockRemoveSelectedTrick = jest.fn();
const mockRecords: CustomTrick[] = [];
let mockSelectedTrickIds: string[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTrickActions: () => ({
    addCustomTrick: mockAddCustomTrick,
    updateCustomTrick: mockUpdateCustomTrick,
  }),
  useCustomTricks: () => ({ tricks: mockRecords }),
}));

jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ selectedTrickIds: mockSelectedTrickIds }),
  useUserProfileActions: () => ({
    toggleSelectedTrick: mockToggleSelectedTrick,
    removeSelectedTrick: mockRemoveSelectedTrick,
  }),
}));

jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));

jest.mock('@/features/goals/state/goal-provider', () => ({ useGoals: () => ({ goals: [] }) }));
jest.mock('@/features/notes/state/note-provider', () => ({ useNotes: () => ({ notes: [] }) }));
jest.mock('@/features/stats/state/practice-history-provider', () => ({
  usePracticeHistory: () => ({ sessions: [] }),
}));

function savedTrick(id: string, draft: CustomTrickDraft): CustomTrick {
  return { id, ...draft } as CustomTrick;
}

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function containsText(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) => node.props.children === text).length > 0;
}

function resetMocks() {
  mockAddCustomTrick.mockReset();
  mockUpdateCustomTrick.mockReset();
  mockToggleSelectedTrick.mockReset();
  mockRemoveSelectedTrick.mockReset();
  mockRecords.length = 0;
  mockSelectedTrickIds = [];
  mockAddCustomTrick.mockImplementation((draft: CustomTrickDraft) => {
    const validation = validateCustomTrickDraft(draft);
    if (validation.status === 'invalid') return validation;
    const trick = savedTrick('created-custom', draft);
    mockRecords.push(trick);
    return { status: 'saved', trick };
  });
  mockUpdateCustomTrick.mockImplementation((id: string, draft: CustomTrickDraft) => {
    const validation = validateCustomTrickDraft(draft);
    if (validation.status === 'invalid') return validation;
    const trick = savedTrick(id, draft);
    const index = mockRecords.findIndex((candidate) => candidate.id === id);
    if (index >= 0) mockRecords[index] = trick;
    return { status: 'saved', trick };
  });
}

describe('CustomTrickForm', () => {
  beforeEach(resetMocks);

  it('keeps an invalid standalone save enabled, shows the name error, and stays open', () => {
    const onSaved = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CustomTrickForm kind="standalone" onCancel={jest.fn()} onSaved={onSaved} />);
    });

    const saveButton = findByLabel(renderer, 'Save custom trick');
    expect(saveButton.props.disabled).not.toBe(true);

    act(() => saveButton.props.onPress());

    expect(containsText(renderer, 'Enter a trick name.')).toBe(true);
    expect(findByLabel(renderer, 'Save custom trick')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it('shows sequence name and ordered-step errors after an invalid submit', () => {
    const onSaved = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CustomTrickForm kind="sequence" onCancel={jest.fn()} onSaved={onSaved} />);
    });

    const saveButton = findByLabel(renderer, 'Save custom trick');
    expect(saveButton.props.disabled).not.toBe(true);
    act(() => saveButton.props.onPress());

    expect(containsText(renderer, 'Enter a sequence name.')).toBe(true);
    expect(containsText(renderer, 'Every sequence step needs a name.')).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it('renders the validator rank error for an invalid edit fixture', () => {
    const initialTrick = { id: 'rank-invalid', kind: 'standalone', name: 'Rank test', kenteiRank: 13 } as CustomTrick;
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CustomTrickForm initialTrick={initialTrick} kind="standalone" onCancel={jest.fn()} onSaved={jest.fn()} />);
    });

    act(() => findByLabel(renderer, 'Save changes').props.onPress());

    expect(containsText(renderer, 'Use a whole Kentei rank from 1 to 12, or leave it blank.')).toBe(true);
    expect(mockUpdateCustomTrick).toHaveBeenCalledTimes(1);
  });

  it('saves valid standalone and sequence drafts once', () => {
    const standaloneSaved = jest.fn();
    let standalone!: ReactTestRenderer;
    act(() => {
      standalone = create(<CustomTrickForm kind="standalone" onCancel={jest.fn()} onSaved={standaloneSaved} />);
    });
    act(() => findByLabel(standalone, 'Trick name').props.onChangeText('Stilt flip'));
    act(() => findByLabel(standalone, 'Save custom trick').props.onPress());

    expect(standaloneSaved).toHaveBeenCalledTimes(1);
    expect(mockAddCustomTrick).toHaveBeenCalledTimes(1);
    expect(mockRecords).toHaveLength(1);

    const sequenceSaved = jest.fn();
    let sequence!: ReactTestRenderer;
    act(() => {
      sequence = create(<CustomTrickForm kind="sequence" onCancel={jest.fn()} onSaved={sequenceSaved} />);
    });
    act(() => findByLabel(sequence, 'Sequence name').props.onChangeText('Morning line'));
    act(() => findByLabel(sequence, 'Custom sequence step 1').props.onChangeText('Swing to cup'));
    act(() => findByLabel(sequence, 'Custom sequence step 2').props.onChangeText('Cup to spike'));
    act(() => findByLabel(sequence, 'Save custom trick').props.onPress());

    expect(sequenceSaved).toHaveBeenCalledTimes(1);
    expect(mockAddCustomTrick).toHaveBeenCalledTimes(2);
    expect(mockRecords).toHaveLength(2);
  });

  it('updates an existing trick in place and preserves focused-trick behavior', () => {
    const initialTrick = { id: 'custom-existing', kind: 'standalone', name: 'Old name' } as CustomTrick;
    mockRecords.push(initialTrick);
    mockSelectedTrickIds = ['custom-existing'];
    const onSaved = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CustomTrickForm initialTrick={initialTrick} kind="standalone" onCancel={jest.fn()} onSaved={onSaved} />);
    });
    act(() => findByLabel(renderer, 'Trick name').props.onChangeText('New name'));
    act(() => findByLabel(renderer, 'Added to focused tricks. Double tap to remove.').props.onPress());
    act(() => findByLabel(renderer, 'Save changes').props.onPress());

    expect(mockUpdateCustomTrick).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTrick.mock.calls[0][0]).toBe('custom-existing');
    expect(mockRecords).toHaveLength(1);
    expect(mockRecords[0].id).toBe('custom-existing');
    expect(mockRemoveSelectedTrick).toHaveBeenCalledWith('custom-existing');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
