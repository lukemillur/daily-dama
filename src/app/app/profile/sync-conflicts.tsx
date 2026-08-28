import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle } from '@/components/ui/typography';
import { SyncConflictList } from '@/features/profile/components/sync-conflict-list';
import { useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';

export default function SyncConflictsScreen() {
  const router = useRouter();
  const { conflicts, resolveConflict, hasHydrated } = useSyncCoordinatorStatus();
  return <Screen><DisplayTitle>Resolve sync conflicts</DisplayTitle>{!hasHydrated ? <BodyText>Loading sync records…</BodyText> : <SyncConflictList conflicts={conflicts} onResolve={(conflict, choice) => { void resolveConflict(conflict.domain, conflict.recordId, choice).then(() => router.replace('/app/profile')); }} />}</Screen>;
}
