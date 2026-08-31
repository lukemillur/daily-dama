import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { GuestImportState } from '@/features/guest-import/model/guest-import';
import { INITIAL_GUEST_IMPORT_STATE } from '@/features/guest-import/model/guest-import';
import { GuestImportPreview } from '@/features/guest-import/components/guest-import-preview';
import type { Identity } from '@/shared/persistence/identity';

const mockDismiss = jest.fn();
let mockUseGuestImportResult: {
  state: GuestImportState;
  dismiss: () => void;
} = {
  state: INITIAL_GUEST_IMPORT_STATE,
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

describe('GuestImportPreview', () => {
  beforeEach(() => {
    mockDismiss.mockReset();
    mockIdentity = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
    mockUseGuestImportResult = {
      state: INITIAL_GUEST_IMPORT_STATE,
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

  it.each(['idle', 'cancelled', 'completed', 'inventorying'] as const)(
    'renders nothing for status %s',
    async (status) => {
      mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState(status) };
      const root = await mount();
      expect(root.toJSON()).toBeNull();
    },
  );

  // T186.1: awaitingConfirmation is now unconditionally hidden, regardless
  // of inventory contents -- the hook auto-confirms nonzero-local records
  // itself, and an all-zero record is permanently parked (see
  // isGuestImportPendingResolution's doc comment).
  it.each([
    ['a nonzero-local inventory', { profile: { local: 2, cloud: 0 }, customTricks: { local: 0, cloud: 0 }, practiceHistory: { local: 5, cloud: 1 }, goals: { local: 0, cloud: 0 }, notes: { local: 0, cloud: 0 } }],
    ['an all-zero inventory', { profile: { local: 0, cloud: 0 }, customTricks: { local: 0, cloud: 0 }, practiceHistory: { local: 0, cloud: 0 }, goals: { local: 0, cloud: 0 }, notes: { local: 0, cloud: 0 } }],
  ] as Array<[string, GuestImportState['inventory']]>)('renders nothing for awaitingConfirmation with %s', async (_label, inventory) => {
    mockUseGuestImportResult = {
      ...mockUseGuestImportResult,
      state: withState('awaitingConfirmation', { inventory, targetKind: 'existing' }),
    };
    const root = await mount();
    expect(root.toJSON()).toBeNull();
  });

  it('renders an inert progress row for status uploading', async () => {
    mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState('uploading') };
    const root = await mount();
    expect(findByLabel(root, 'Import in progress').length).toBeGreaterThan(0);
  });

  // T186.2: the manual choice/JSON-snapshot UI is deleted entirely, not
  // just hidden -- no raw record data (or a button referencing it) can
  // reach this component's rendered output for any reachable status.
  it('never renders the deleted manual profile-choice UI', async () => {
    mockUseGuestImportResult = { ...mockUseGuestImportResult, state: withState('uploading') };
    const root = await mount();
    expect(findByLabel(root, 'Keep guest profile preferences')).toHaveLength(0);
    expect(findByLabel(root, 'Keep cloud profile preferences')).toHaveLength(0);
  });
});
