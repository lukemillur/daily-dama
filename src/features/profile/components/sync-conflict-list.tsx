import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import type { SyncConflictRecord } from '@/shared/sync/conflict';
import { ScrollView, View } from 'react-native';

export function SyncConflictList({ conflicts, onResolve }: { readonly conflicts: readonly SyncConflictRecord[]; readonly onResolve: (conflict: SyncConflictRecord, choice: 'local' | 'server') => void }) {
  if (conflicts.length === 0) return <BodyText>No conflicts need your attention.</BodyText>;
  const orderedConflicts = conflicts.slice().sort((a, b) => a.domain.localeCompare(b.domain) || a.recordId.localeCompare(b.recordId));
  return <ScrollView>{orderedConflicts.map((conflict) => <View key={conflict.domain + ':' + conflict.recordId} accessible accessibilityLabel={`${conflict.domain} conflict for ${conflict.recordId}`}>
    <Eyebrow>{conflict.domain}</Eyebrow>
    <DisplayTitle>{conflict.recordId}</DisplayTitle>
    <BodyText>On this device: {conflict.localSnapshot === null ? 'Deleted on this device' : JSON.stringify(conflict.localSnapshot)}</BodyText>
    <BodyText>On server: {conflict.serverSnapshot === null ? 'Deleted on server' : JSON.stringify(conflict.serverSnapshot)}</BodyText>
    <Button accessibilityLabel={'Keep ' + conflict.recordId + ' on this device'} onPress={() => onResolve(conflict, 'local')} variant="primary" size="medium">Keep on this device</Button>
    <Button accessibilityLabel={'Keep ' + conflict.recordId + ' on server'} onPress={() => onResolve(conflict, 'server')} variant="secondary" size="medium">Keep on server</Button>
  </View>)}</ScrollView>;
}
