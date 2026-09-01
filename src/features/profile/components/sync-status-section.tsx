import { styled } from 'styled-components/native';
import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { useAuthState } from '@/features/auth/state/auth-provider';
import { useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';
import { formatConflictCount, formatPendingCount, formatSyncTimestamp } from '@/shared/sync/sync-status';

export function SyncStatusSection() {
  const authState = useAuthState();
  const { syncStatus, retry } = useSyncCoordinatorStatus();
  if (authState.status !== 'authenticated') return null;
  const headline: Record<typeof syncStatus.kind, string> = { syncing: 'Syncing now.', offline: 'You are offline.', conflict: 'Conflicts need your attention.', 'retryable-failure': 'Sync needs a retry.', pending: 'Sync is queued.', synced: 'Everything is synced.', 'no-sync-yet': 'No sync yet.' };
  const copy = syncStatus.conflictCount > 0 ? formatConflictCount(syncStatus.conflictCount) : syncStatus.pendingCount > 0 ? formatPendingCount(syncStatus.pendingCount) : syncStatus.kind === 'offline' ? 'Pending changes will retry when you reconnect.' : syncStatus.kind === 'no-sync-yet' ? 'Your account has not completed a sync yet.' : syncStatus.lastSuccessfulSyncAt ? `Last successful sync: ${formatSyncTimestamp(syncStatus.lastSuccessfulSyncAt)}` : 'Your latest changes are safe on this device.';
  return <Section><Eyebrow>Synchronization</Eyebrow><DisplayTitle>{headline[syncStatus.kind]}</DisplayTitle><BodyText>{copy}</BodyText><RetryButton disabled={syncStatus.coordinator === 'running'} onPress={retry} variant="secondary" size="medium">{syncStatus.coordinator === 'running' ? 'Syncing…' : 'Retry sync'}</RetryButton></Section>;
}
const Section = styled.View`margin-top: 28px;`;
const RetryButton = styled(Button)`align-self: flex-start; margin-top: 18px;`;
