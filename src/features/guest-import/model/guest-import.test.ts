import { describe, expect, it } from '@jest/globals';

import {
  createGuestImportId,
  guestImportReducer,
  INITIAL_GUEST_IMPORT_STATE,
  type GuestImportDomainCounts,
  type GuestImportState,
} from '@/features/guest-import/model/guest-import';
import { SYNC_DOMAINS } from '@/shared/sync/domain';

const NAMESPACE = 'user:11111111-1111-1111-1111-111111111111';
const OTHER_NAMESPACE = 'user:22222222-2222-2222-2222-222222222222';
const IMPORT_ID = 'guest-import-abc';
const NOW = 1_700_000_000_000;

function emptyCloudInventory(): GuestImportDomainCounts {
  const counts = { } as Record<string, { local: number; cloud: number }>;
  for (const domain of SYNC_DOMAINS) {
    counts[domain] = { local: 3, cloud: 0 };
  }
  return counts as GuestImportDomainCounts;
}

function nonEmptyCloudInventory(): GuestImportDomainCounts {
  const counts = { } as Record<string, { local: number; cloud: number }>;
  for (const domain of SYNC_DOMAINS) {
    counts[domain] = { local: 3, cloud: 1 };
  }
  return counts as GuestImportDomainCounts;
}

function afterImportRequested(): GuestImportState {
  return guestImportReducer(INITIAL_GUEST_IMPORT_STATE, {
    type: 'importRequested',
    importId: IMPORT_ID,
    identityNamespace: NAMESPACE,
    now: NOW,
  });
}

describe('guestImportReducer', () => {
  it('importRequested moves idle to inventorying and sets identity/import id', () => {
    const state = afterImportRequested();
    expect(state.status).toBe('inventorying');
    expect(state.importId).toBe(IMPORT_ID);
    expect(state.ownerIdentityNamespace).toBe(NAMESPACE);
    expect(state.startedAt).toBe(NOW);
  });

  it('importRequested is a no-op re-entrant guard from any non-idle status', () => {
    const inventorying = afterImportRequested();
    const result = guestImportReducer(inventorying, {
      type: 'importRequested',
      importId: 'another-id',
      identityNamespace: OTHER_NAMESPACE,
      now: NOW + 1,
    });
    expect(result).toBe(inventorying);
  });

  it('inventoryFailed moves inventorying to idle with an error and clears identity', () => {
    const inventorying = afterImportRequested();
    const result = guestImportReducer(inventorying, {
      type: 'inventoryFailed',
      importId: IMPORT_ID,
      errorMessage: 'offline',
      now: NOW + 1,
    });
    expect(result.status).toBe('idle');
    expect(result.errorMessage).toBe('offline');
    expect(result.importId).toBeUndefined();
    expect(result.ownerIdentityNamespace).toBeUndefined();
  });

  it('inventoryFailed with a stale importId is a no-op', () => {
    const inventorying = afterImportRequested();
    const result = guestImportReducer(inventorying, {
      type: 'inventoryFailed',
      importId: 'stale-id',
      errorMessage: 'offline',
      now: NOW + 1,
    });
    expect(result).toBe(inventorying);
  });

  it('inventoryCompleted derives targetKind "empty" when every domain has zero cloud count', () => {
    const inventorying = afterImportRequested();
    const inventory = emptyCloudInventory();
    const result = guestImportReducer(inventorying, {
      type: 'inventoryCompleted',
      importId: IMPORT_ID,
      inventory,
      now: NOW + 1,
    });
    expect(result.status).toBe('awaitingConfirmation');
    expect(result.targetKind).toBe('empty');
    expect(result.inventory).toBe(inventory);
  });

  it('inventoryCompleted derives targetKind "existing" when any domain has a nonzero cloud count', () => {
    const inventorying = afterImportRequested();
    const inventory = nonEmptyCloudInventory();
    const result = guestImportReducer(inventorying, {
      type: 'inventoryCompleted',
      importId: IMPORT_ID,
      inventory,
      now: NOW + 1,
    });
    expect(result.status).toBe('awaitingConfirmation');
    expect(result.targetKind).toBe('existing');
  });

  it('inventoryCompleted with a stale importId is a no-op', () => {
    const inventorying = afterImportRequested();
    const result = guestImportReducer(inventorying, {
      type: 'inventoryCompleted',
      importId: 'stale-id',
      inventory: emptyCloudInventory(),
      now: NOW + 1,
    });
    expect(result).toBe(inventorying);
  });
});

describe('guestImportReducer: upload/profile-choice/conflicts', () => {
  function afterAwaitingConfirmation(inventory: GuestImportDomainCounts): GuestImportState {
    const inventorying = afterImportRequested();
    return guestImportReducer(inventorying, { type: 'inventoryCompleted', importId: IMPORT_ID, inventory, now: NOW + 1 });
  }

  it('confirmPressed moves awaitingConfirmation to uploading with every domain pending', () => {
    const awaiting = afterAwaitingConfirmation(nonEmptyCloudInventory());
    const result = guestImportReducer(awaiting, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });
    expect(result.status).toBe('uploading');
    for (const domain of SYNC_DOMAINS) {
      expect(result.domainOutcomes[domain]).toEqual({ status: 'pending', errorMessage: undefined });
    }
  });

  it('confirmPressed with a stale importId is a no-op', () => {
    const awaiting = afterAwaitingConfirmation(nonEmptyCloudInventory());
    const result = guestImportReducer(awaiting, { type: 'confirmPressed', importId: 'stale', now: NOW + 2 });
    expect(result).toBe(awaiting);
  });

  it('the full uploading -> awaitingProfileChoice -> conflicts -> completed chain, driven by literal actions', () => {
    let state = afterAwaitingConfirmation(nonEmptyCloudInventory());
    state = guestImportReducer(state, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });

    const domains = [...SYNC_DOMAINS];
    for (let i = 0; i < domains.length - 1; i++) {
      state = guestImportReducer(state, {
        type: 'domainUploadSettled',
        importId: IMPORT_ID,
        domain: domains[i],
        outcome: { status: 'succeeded', errorMessage: undefined },
        now: NOW + 3,
      });
      expect(state.status).toBe('uploading');
    }

    // Last domain reports a conflict -- this ticket doesn't populate
    // state.conflicts through this path (that's T159.4's job), so
    // awaitingProfileChoice is exercised via targetKind === 'existing',
    // and the conflicts branch is exercised separately below via a
    // constructed literal state.
    state = guestImportReducer(state, {
      type: 'domainUploadSettled',
      importId: IMPORT_ID,
      domain: domains[domains.length - 1],
      outcome: { status: 'conflict', errorMessage: undefined },
      now: NOW + 3,
    });
    expect(state.status).toBe('awaitingProfileChoice');
    for (const domain of SYNC_DOMAINS) {
      expect(state.domainOutcomes[domain]?.status).not.toBe('pending');
    }

    // Construct a conflicts-bearing awaitingProfileChoice state directly
    // (T159.1 has no real path that populates `conflicts`) to prove
    // profileChoiceMade correctly routes to 'conflicts' when present.
    const withConflicts: GuestImportState = {
      ...state,
      conflicts: [{ domain: 'goals', recordId: 'goal-1', guestSnapshot: { id: 'goal-1' }, cloudSnapshot: { id: 'goal-1' }, cloudRevision: 2 }],
    };
    const afterChoice = guestImportReducer(withConflicts, {
      type: 'profileChoiceMade',
      importId: IMPORT_ID,
      choice: 'cloud',
      now: NOW + 4,
    });
    expect(afterChoice.status).toBe('conflicts');
    expect(afterChoice.profileChoice).toBe('cloud');

    const completed = guestImportReducer(afterChoice, { type: 'conflictsResolved', importId: IMPORT_ID, now: NOW + 5 });
    expect(completed.status).toBe('conflicts');
    state = guestImportReducer(afterChoice, { type: 'conflictResolved', importId: IMPORT_ID, domain: 'goals', recordId: 'goal-1', choice: 'cloud', now: NOW + 5 });
    state = guestImportReducer(state, { type: 'conflictsResolved', importId: IMPORT_ID, now: NOW + 6 });
    expect(state.status).toBe('completed');
  });

  it('profileChoiceMade moves awaitingProfileChoice straight to completed when there are no conflicts', () => {
    let state = afterAwaitingConfirmation(nonEmptyCloudInventory());
    state = guestImportReducer(state, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });
    for (const domain of SYNC_DOMAINS) {
      state = guestImportReducer(state, {
        type: 'domainUploadSettled',
        importId: IMPORT_ID,
        domain,
        outcome: { status: 'succeeded', errorMessage: undefined },
        now: NOW + 3,
      });
    }
    expect(state.status).toBe('awaitingProfileChoice');

    const result = guestImportReducer(state, { type: 'profileChoiceMade', importId: IMPORT_ID, choice: 'guest', now: NOW + 4 });
    expect(result.status).toBe('completed');
    expect(result.profileChoice).toBe('guest');
  });

  it('profileChoiceMade and conflictsResolved with a stale importId are no-ops', () => {
    let state = afterAwaitingConfirmation(nonEmptyCloudInventory());
    state = guestImportReducer(state, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });
    for (const domain of SYNC_DOMAINS) {
      state = guestImportReducer(state, {
        type: 'domainUploadSettled',
        importId: IMPORT_ID,
        domain,
        outcome: { status: 'succeeded', errorMessage: undefined },
        now: NOW + 3,
      });
    }

    const staleChoice = guestImportReducer(state, { type: 'profileChoiceMade', importId: 'stale', choice: 'guest', now: NOW + 4 });
    expect(staleChoice).toBe(state);

    const conflictsState: GuestImportState = { ...state, status: 'conflicts' };
    const staleResolve = guestImportReducer(conflictsState, { type: 'conflictsResolved', importId: 'stale', now: NOW + 4 });
    expect(staleResolve).toBe(conflictsState);
  });

  it('the shorter uploading -> completed chain for an empty-target import', () => {
    let state = afterAwaitingConfirmation(emptyCloudInventory());
    expect(state.targetKind).toBe('empty');
    state = guestImportReducer(state, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });

    for (const domain of SYNC_DOMAINS) {
      state = guestImportReducer(state, {
        type: 'domainUploadSettled',
        importId: IMPORT_ID,
        domain,
        outcome: { status: 'succeeded', errorMessage: undefined },
        now: NOW + 3,
      });
    }

    expect(state.status).toBe('completed');
  });

  it('domainUploadSettled with a stale importId or wrong status is a no-op', () => {
    const awaiting = afterAwaitingConfirmation(emptyCloudInventory());
    const noOpFromAwaiting = guestImportReducer(awaiting, {
      type: 'domainUploadSettled',
      importId: IMPORT_ID,
      domain: 'goals',
      outcome: { status: 'succeeded', errorMessage: undefined },
      now: NOW + 2,
    });
    expect(noOpFromAwaiting).toBe(awaiting);

    let uploading = guestImportReducer(awaiting, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });
    const staleResult = guestImportReducer(uploading, {
      type: 'domainUploadSettled',
      importId: 'stale',
      domain: 'goals',
      outcome: { status: 'succeeded', errorMessage: undefined },
      now: NOW + 3,
    });
    expect(staleResult).toBe(uploading);
  });
});

describe('guestImportReducer: cancel/dismiss/resume/identityChanged/stateRestored', () => {
  it('cancelPressed moves awaitingConfirmation to cancelled', () => {
    const inventorying = afterImportRequested();
    const awaiting = guestImportReducer(inventorying, {
      type: 'inventoryCompleted', importId: IMPORT_ID, inventory: emptyCloudInventory(), now: NOW + 1,
    });
    const result = guestImportReducer(awaiting, { type: 'cancelPressed', importId: IMPORT_ID, now: NOW + 2 });
    expect(result.status).toBe('cancelled');
  });

  it('cancelPressed is not modeled once uploading has started', () => {
    const inventorying = afterImportRequested();
    const awaiting = guestImportReducer(inventorying, {
      type: 'inventoryCompleted', importId: IMPORT_ID, inventory: emptyCloudInventory(), now: NOW + 1,
    });
    const uploading = guestImportReducer(awaiting, { type: 'confirmPressed', importId: IMPORT_ID, now: NOW + 2 });
    const result = guestImportReducer(uploading, { type: 'cancelPressed', importId: IMPORT_ID, now: NOW + 3 });
    expect(result).toBe(uploading);
  });

  it('cancelPressed with a stale importId is a no-op', () => {
    const inventorying = afterImportRequested();
    const awaiting = guestImportReducer(inventorying, {
      type: 'inventoryCompleted', importId: IMPORT_ID, inventory: emptyCloudInventory(), now: NOW + 1,
    });
    const result = guestImportReducer(awaiting, { type: 'cancelPressed', importId: 'stale', now: NOW + 2 });
    expect(result).toBe(awaiting);
  });

  it('dismissPressed resets completed or cancelled back to idle', () => {
    const completed: GuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status: 'completed', importId: IMPORT_ID };
    expect(guestImportReducer(completed, { type: 'dismissPressed' })).toEqual(INITIAL_GUEST_IMPORT_STATE);

    const cancelled: GuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status: 'cancelled', importId: IMPORT_ID };
    expect(guestImportReducer(cancelled, { type: 'dismissPressed' })).toEqual(INITIAL_GUEST_IMPORT_STATE);
  });

  it('dismissPressed is a no-op from any non-terminal status', () => {
    const inventorying = afterImportRequested();
    expect(guestImportReducer(inventorying, { type: 'dismissPressed' })).toBe(inventorying);
  });

  it('resumeRequested adopts a persisted record when the identity namespace matches, only from idle', () => {
    const persisted: GuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      importId: IMPORT_ID,
      ownerIdentityNamespace: NAMESPACE,
      inventory: emptyCloudInventory(),
      targetKind: 'empty',
    };
    const result = guestImportReducer(INITIAL_GUEST_IMPORT_STATE, {
      type: 'resumeRequested', persisted, identityNamespace: NAMESPACE,
    });
    expect(result).toBe(persisted);
  });

  it('resumeRequested is a no-op when the identity namespace does not match', () => {
    const persisted: GuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      importId: IMPORT_ID,
      ownerIdentityNamespace: NAMESPACE,
    };
    const result = guestImportReducer(INITIAL_GUEST_IMPORT_STATE, {
      type: 'resumeRequested', persisted, identityNamespace: OTHER_NAMESPACE,
    });
    expect(result).toBe(INITIAL_GUEST_IMPORT_STATE);
  });

  it('resumeRequested only applies from idle', () => {
    const inventorying = afterImportRequested();
    const persisted: GuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      importId: 'other-id',
      ownerIdentityNamespace: NAMESPACE,
    };
    const result = guestImportReducer(inventorying, { type: 'resumeRequested', persisted, identityNamespace: NAMESPACE });
    expect(result).toBe(inventorying);
  });

  it('stateRestored unconditionally adopts the given state', () => {
    const restored: GuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status: 'cancelled' };
    const result = guestImportReducer(afterImportRequested(), { type: 'stateRestored', state: restored });
    expect(result).toBe(restored);
  });

  const cancellableStatuses: readonly GuestImportState['status'][] = [
    'inventorying',
    'awaitingConfirmation',
    'uploading',
    'awaitingProfileChoice',
    'conflicts',
  ];

  it.each(cancellableStatuses)('identityChanged resets state %s when the namespace differs', (status) => {
    const state: GuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status, ownerIdentityNamespace: NAMESPACE, importId: IMPORT_ID };
    const result = guestImportReducer(state, { type: 'identityChanged', identityNamespace: OTHER_NAMESPACE });
    expect(result).toEqual(INITIAL_GUEST_IMPORT_STATE);
  });

  const terminalStatuses: readonly GuestImportState['status'][] = ['idle', 'completed', 'cancelled'];

  it.each(terminalStatuses)('identityChanged leaves state %s alone even when the namespace differs', (status) => {
    const state: GuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status, ownerIdentityNamespace: NAMESPACE, importId: IMPORT_ID };
    const result = guestImportReducer(state, { type: 'identityChanged', identityNamespace: OTHER_NAMESPACE });
    expect(result).toBe(state);
  });

  it('identityChanged is a no-op when the namespace has not changed', () => {
    const state = afterImportRequested();
    const result = guestImportReducer(state, { type: 'identityChanged', identityNamespace: NAMESPACE });
    expect(result).toBe(state);
  });

  it('identityChanged is a no-op when ownerIdentityNamespace was never set', () => {
    const result = guestImportReducer(INITIAL_GUEST_IMPORT_STATE, { type: 'identityChanged', identityNamespace: NAMESPACE });
    expect(result).toBe(INITIAL_GUEST_IMPORT_STATE);
  });
});

describe('createGuestImportId', () => {
  it('is deterministic for a given now/random pair and varies otherwise', () => {
    const a = createGuestImportId(1000, 0.5);
    const b = createGuestImportId(1000, 0.5);
    const c = createGuestImportId(2000, 0.5);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('guest-import-')).toBe(true);
  });
});
