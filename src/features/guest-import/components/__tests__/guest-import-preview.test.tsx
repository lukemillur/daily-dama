import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { GuestImportState } from '@/features/guest-import/model/guest-import';
import { INITIAL_GUEST_IMPORT_STATE } from '@/features/guest-import/model/guest-import';
import { GuestImportPreview } from '@/features/guest-import/components/guest-import-preview';
import type { Identity } from '@/shared/persistence/identity';

const mockConfirmImport = jest.fn();
const mockCancelImport = jest.fn();
const mockDismiss = jest.fn();
let mockUseGuestImportResult: {
  state: GuestImportState;
  confirmImport: () => void;
  cancelImport: () => void;
  dismiss: () => void;
} = {
  state: INITIAL_GUEST_IMPORT_STATE,
  confirmImport: mockConfirmImport,
  cancelImport: mockCancelImport,
  dismiss: mockDismiss,
};

jest.mock('@/features/guest-import/state/use-guest-import', () => ({
  useGuestImport: () => mockUseGuestImportResult,
}));

let mockIdentity: Identity = { kind: 'guest' };
jest.mock('@/shared/persistence/identity-provider', () => ({
  useIdentityHandle: () => ({ identity: mockIdentity, generation: 0, context: { } }),
}));

function withState(status: GuestImportState['status'], overrides: Partial<GuestImportState> = { }): GuestImportState {
  return { ...INITIAL_GUEST_IMPORT_STATE, status, ...overrides };
}

async function mount(): Promise<ReactTestRenderer> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<GuestImportPreview />);
  });
  return root;
}

function findByLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    return typeof children === 'string' && children === text;
  });
}

describe('GuestImportPreview', () => {
  beforeEach(() => {
    mockConfirmImport.mockReset();
    mockCancelImport.mockReset();
    mockDismiss.mockReset();
    mockIdentity = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
    mockUseGuestImportResult = {
      state: INITIAL_GUEST_IMPORT_STATE,
      confirmImport: mockConfirmImport,
      cancelImport: mockCancelImport,
      dismiss: mockDismiss,
    };
  });

  it('renders nothing for a guest identity, regardless of status', async () => {
    mockIdentity = { kind: 'guest' };
    mockUseGuestImportResult = {
      ...mockUseGuestImportResult,
      state: withState('awaitingConfirmation', {
        inventory: {
          profile: { local: 1, cloud: 0 },
          customTricks: { local: 1, cloud: 0 },
          practiceHistory: { local: 1, cloud: 0 },
          goals: { local: 1, cloud: 0 },
          notes: { local: 1, cloud: 0 },
        },
        targetKind: 'empty',
      }),
    };
    const root = await mount();
    expect(root.toJSON()).toBeNull();
  });

  it.each(['idle', 'cancelled', 'completed'] as const)('renders nothing for status %s', async (status) => {
    mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState(status) };
    const root = await mount();
    expect(root.toJSON()).toBeNull();
  });

  it('renders nothing for awaitingConfirmation when every domain has zero local count', async () => {
    mockUseGuestImportResult = {
      ...mockUseGuestImportResult,
      state: withState('awaitingConfirmation', {
        inventory: {
          profile: { local: 0, cloud: 0 },
          customTricks: { local: 0, cloud: 0 },
          practiceHistory: { local: 0, cloud: 0 },
          goals: { local: 0, cloud: 0 },
          notes: { local: 0, cloud: 0 },
        },
        targetKind: 'empty',
      }),
    };
    const root = await mount();
    expect(root.toJSON()).toBeNull();
  });

  it('renders a loading row for inventorying', async () => {
    mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState('inventorying') };
    const root = await mount();
    expect(findByLabel(root, 'Checking local practice data').length).toBeGreaterThan(0);
  });

  it('renders per-domain counts and a working import/not-now pair for a populated awaitingConfirmation', async () => {
    mockUseGuestImportResult = {
      ...mockUseGuestImportResult,
      state: withState('awaitingConfirmation', {
        inventory: {
          profile: { local: 2, cloud: 0 },
          customTricks: { local: 0, cloud: 0 },
          practiceHistory: { local: 5, cloud: 1 },
          goals: { local: 0, cloud: 0 },
          notes: { local: 0, cloud: 0 },
        },
        targetKind: 'existing',
      }),
    };
    const root = await mount();

    expect(findByLabel(root, 'Import your practice data').length).toBeGreaterThan(0);
    expect(findByText(root, 'Custom tricks').length).toBe(0);
    expect(findByText(root, 'Profile & trick selections').length).toBeGreaterThan(0);
    expect(findByText(root, 'Practice history').length).toBeGreaterThan(0);

    const importButtons = findByLabel(root, 'Import my practice data').filter(
      (node) => typeof node.props.onPress === 'function',
    );
    expect(importButtons.length).toBeGreaterThan(0);
    act(() => {
      importButtons[0].props.onPress();
    });
    expect(mockConfirmImport).toHaveBeenCalledTimes(1);

    const notNowButtons = findByLabel(root, 'Not now').filter((node) => typeof node.props.onPress === 'function');
    expect(notNowButtons.length).toBeGreaterThan(0);
    act(() => {
      notNowButtons[0].props.onPress();
    });
    expect(mockCancelImport).toHaveBeenCalledTimes(1);
  });

  it.each(['uploading', 'awaitingProfileChoice', 'conflicts'] as const)(
    'renders an inert progress row for status %s',
    async (status) => {
      mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState(status) };
      const root = await mount();
      expect(findByLabel(root, 'Import in progress').length).toBeGreaterThan(0);
    },
  );
});
