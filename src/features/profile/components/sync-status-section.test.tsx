import { describe, expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { SyncStatusSection } from '@/features/profile/components/sync-status-section';
import { useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';
jest.mock('@/shared/sync/sync-coordinator-provider');
const mocked = jest.mocked(useSyncCoordinatorStatus);
const base = { syncStatus: { kind: 'synced' as const, coordinator: 'idle' as const, pendingCount: 0, conflictCount: 0, retryableFailureCount: 0, online: true, lastSuccessfulSyncAt: 1, isSynced: true }, retry: jest.fn() };
describe('SyncStatusSection', () => {
  test.each([['no-sync-yet', 'No sync yet.'], ['syncing', 'Syncing now.'], ['offline', 'You are offline.'], ['pending', 'Sync is queued.'], ['retryable-failure', 'Sync needs a retry.'], ['conflict', 'Conflicts need your attention.']])('%s', (kind, headline) => { mocked.mockReturnValue({ ...base, syncStatus: { ...base.syncStatus, kind: kind as never, lastSuccessfulSyncAt: undefined, pendingCount: kind === 'pending' ? 1 : 0, conflictCount: kind === 'conflict' ? 1 : 0 } } as never); let tree!: ReturnType<typeof create>; act(() => { tree = create(<SyncStatusSection />); }); expect(tree.root.findAll((node) => node.props.children === headline).length).toBeGreaterThan(0); });
  test('dispatches retry', () => { const retry = jest.fn(); mocked.mockReturnValue({ ...base, retry } as never); let tree!: ReturnType<typeof create>; act(() => { tree = create(<SyncStatusSection />); }); act(() => { tree.root.find((node) => node.props.children === 'Retry sync').props.onPress(); }); expect(retry).toHaveBeenCalledTimes(1); });
});
