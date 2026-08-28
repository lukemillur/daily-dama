import { describe, expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { SyncConflictList } from '@/features/profile/components/sync-conflict-list';
import type { SyncConflictRecord } from '@/shared/sync/conflict';

const conflicts: SyncConflictRecord[] = [
  { domain: 'profile', recordId: 'user-1', operationId: 'p', operationType: 'upsert', expectedRevision: 1, serverRevision: 2, localSnapshot: { theme: '#111111' }, serverSnapshot: { theme: '#222222' }, createdAt: 1 },
  { domain: 'customTricks', recordId: 'trick-1', operationId: 't', operationType: 'delete', expectedRevision: 1, serverRevision: 2, localSnapshot: null, serverSnapshot: { name: 'Orbit' }, createdAt: 2 },
  { domain: 'goals', recordId: 'goal-1', operationId: 'g', operationType: 'upsert', expectedRevision: 3, serverRevision: 4, localSnapshot: { target_count: 3 }, serverSnapshot: { target_count: 5 }, createdAt: 3 },
  { domain: 'notes', recordId: 'note-1', operationId: 'n', operationType: 'delete', expectedRevision: 2, serverRevision: 3, localSnapshot: null, serverSnapshot: null, createdAt: 4 },
];

describe('SyncConflictList', () => {
  test('renders typed resource labels, comparisons, tombstones, and both choices', () => {
    const onResolve = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<SyncConflictList conflicts={conflicts} onResolve={onResolve} />); });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('profile');
    expect(rendered).toContain('customTricks');
    expect(rendered).toContain('goals');
    expect(rendered).toContain('notes');
    expect(rendered).toContain('Deleted on server');
    const local = tree.root.findAll((node) => node.props.children === 'Keep on this device' && typeof node.props.onPress === 'function');
    const server = tree.root.findAll((node) => node.props.children === 'Keep on server' && typeof node.props.onPress === 'function');
    expect(local).toHaveLength(4); expect(server).toHaveLength(4);
    act(() => { local[3].props.onPress(); server[1].props.onPress(); });
    expect(onResolve).toHaveBeenNthCalledWith(1, conflicts[0], 'local');
    expect(onResolve).toHaveBeenNthCalledWith(2, conflicts[2], 'server');
  });

  test('renders the empty state', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<SyncConflictList conflicts={[]} onResolve={jest.fn()} />); });
    expect(JSON.stringify(tree.toJSON())).toContain('No conflicts need your attention.');
  });
});
