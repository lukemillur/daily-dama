import { describe, expect, it } from '@jest/globals';

import { decodeCloudCursor, encodeCloudCursor, type CloudRepositoryError } from '@/shared/supabase/cloud-repository';
import type { OutboxOperation } from '@/shared/sync/outbox-operation';
import {
  pullAllPages,
  pushOutboxOperations,
  type SyncPushRequest,
  type SyncTransportPullResult,
  type SyncTransportPushResult,
  type SyncTransportRepository,
} from '@/shared/sync/transport';

interface FakeRow {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  readonly fields: Record<string, unknown>;
}

interface FakeRepository extends SyncTransportRepository<FakeRow> {
  getStoredRow(id: string): FakeRow | undefined;
  seedRevision(id: string, revision: number): void;
}

interface FakeRepositoryOptions {
  readonly now: () => number;
  readonly seed?: readonly FakeRow[];
  readonly failPullOnCursor?: string; // simulate a pull() failure at a given cursor
  readonly failPushForRecordId?: string; // simulate a push() network failure for a recordId
}

function networkError(message: string): CloudRepositoryError {
  return { kind: 'network', message };
}

function createFakeSyncTransportRepository(options: FakeRepositoryOptions): FakeRepository {
  const rows = new Map<string, FakeRow>();
  for (const row of options.seed ?? []) {
    rows.set(row.id, row);
  }
  const opLedger = new Map<string, SyncTransportPushResult<FakeRow>>();
  let nextSequence = rows.size;

  function sortedRows(): FakeRow[] {
    return [...rows.values()].sort((a, b) => {
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  return {
    async pull(request): Promise<SyncTransportPullResult<FakeRow>> {
      if (options.failPullOnCursor !== undefined && (request.cursor ?? null) === options.failPullOnCursor) {
        return { status: 'failed', error: networkError('simulated pull failure') };
      }

      const offset = decodeCloudCursor(request.cursor ?? null);
      const all = sortedRows();
      const items = all.slice(offset, offset + request.limit);
      const nextOffset = offset + items.length;
      const nextCursor = nextOffset < all.length ? encodeCloudCursor(nextOffset) : null;

      return { status: 'succeeded', page: { items, nextCursor } };
    },

    async push(request: SyncPushRequest): Promise<SyncTransportPushResult<FakeRow>> {
      const cached = opLedger.get(request.operationId);
      if (cached !== undefined) {
        return cached;
      }

      if (options.failPushForRecordId !== undefined && request.recordId === options.failPushForRecordId) {
        const result: SyncTransportPushResult<FakeRow> = {
          status: 'failed',
          error: networkError('simulated push failure'),
        };
        opLedger.set(request.operationId, result);
        return result;
      }

      const existing = rows.get(request.recordId);

      if (request.operationType === 'upsert') {
        if (existing !== undefined && request.expectedRevision !== existing.revision) {
          const result: SyncTransportPushResult<FakeRow> = {
            status: 'conflict',
            conflict: {
              operationId: request.operationId,
              recordId: request.recordId,
              expectedRevision: request.expectedRevision,
              serverRevision: existing.revision,
            },
          };
          opLedger.set(request.operationId, result);
          return result;
        }

        const now = options.now();
        nextSequence += 1;
        const row: FakeRow = {
          id: request.recordId,
          revision: existing === undefined ? 1 : existing.revision + 1,
          createdAt: existing === undefined ? now * 1000 + nextSequence : existing.createdAt,
          updatedAt: now,
          deletedAt: null,
          fields: request.payload ?? {},
        };
        rows.set(request.recordId, row);
        const result: SyncTransportPushResult<FakeRow> = { status: 'succeeded', row };
        opLedger.set(request.operationId, result);
        return result;
      }

      // delete
      if (existing !== undefined && request.expectedRevision !== existing.revision) {
        const result: SyncTransportPushResult<FakeRow> = {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: request.recordId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
        opLedger.set(request.operationId, result);
        return result;
      }

      const now = options.now();
      const base = existing ?? {
        id: request.recordId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        fields: {},
      };
      const row: FakeRow = {
        ...base,
        revision: base.revision + 1,
        updatedAt: now,
        deletedAt: base.deletedAt ?? now,
      };
      rows.set(request.recordId, row);
      const result: SyncTransportPushResult<FakeRow> = { status: 'succeeded', row };
      opLedger.set(request.operationId, result);
      return result;
    },

    getStoredRow(id: string): FakeRow | undefined {
      return rows.get(id);
    },

    seedRevision(id: string, revision: number): void {
      const existing = rows.get(id);
      if (existing === undefined) {
        rows.set(id, {
          id,
          revision,
          createdAt: options.now(),
          updatedAt: options.now(),
          deletedAt: null,
          fields: {},
        });
        return;
      }
      rows.set(id, { ...existing, revision });
    },
  };
}

function makeFixtures(count: number): FakeRow[] {
  const fixtures: FakeRow[] = [];
  for (let i = 0; i < count; i += 1) {
    fixtures.push({
      id: `row-${String(i).padStart(5, '0')}`,
      revision: 1,
      createdAt: 1_000_000 - i, // descending createdAt so id ascends within a tie-free set here
      updatedAt: 1_000_000 - i,
      deletedAt: null,
      fields: { index: i },
    });
  }
  return fixtures;
}

function makeUpsertOperation(overrides: Partial<OutboxOperation> & { operationId: string; recordId: string }): OutboxOperation {
  return {
    domain: 'customTricks',
    operationType: 'upsert',
    payload: { name: 'test' },
    createdAt: 0,
    attemptCount: 0,
    lastAttemptedAt: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

function makeDeleteOperation(overrides: Partial<OutboxOperation> & { operationId: string; recordId: string }): OutboxOperation {
  return {
    domain: 'customTricks',
    operationType: 'delete',
    payload: null,
    createdAt: 0,
    attemptCount: 0,
    lastAttemptedAt: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

describe('pullAllPages', () => {
  it('1. pulls more than 1,000 ordered fixtures without gaps or duplicates', async () => {
    const fixtures = makeFixtures(1200);
    const repository = createFakeSyncTransportRepository({ now: () => 0, seed: fixtures });

    const result = await pullAllPages(repository, { pageSize: 47, startCursor: null });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;

    expect(result.rows).toHaveLength(1200);
    expect(new Set(result.rows.map((r) => r.id)).size).toBe(1200);

    const expectedOrder = [...fixtures]
      .sort((a, b) => (a.createdAt !== b.createdAt ? b.createdAt - a.createdAt : a.id.localeCompare(b.id)))
      .map((r) => r.id);
    expect(result.rows.map((r) => r.id)).toEqual(expectedOrder);
    expect(result.finalCursor).toBeNull();
  });

  it('2. returns an empty succeeded result for an empty repository', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 0, seed: [] });

    const result = await pullAllPages(repository, { pageSize: 47, startCursor: null });

    expect(result).toEqual({ status: 'succeeded', rows: [], finalCursor: null });
  });

  it('3. handles a boundary where page size exactly divides the fixture count', async () => {
    const fixtures = makeFixtures(100);
    const repository = createFakeSyncTransportRepository({ now: () => 0, seed: fixtures });

    const result = await pullAllPages(repository, { pageSize: 25, startCursor: null });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.rows).toHaveLength(100);
    expect(new Set(result.rows.map((r) => r.id)).size).toBe(100);
  });

  it('4. returns partial progress and the failing cursor when a pull fails mid-sequence', async () => {
    const fixtures = makeFixtures(300);
    const pageSize = 100;
    // page 1: cursor null -> offset 0; page 2: cursor "100"; page 3: cursor "200" (fails here)
    const failingCursor = encodeCloudCursor(200);
    const repository = createFakeSyncTransportRepository({
      now: () => 0,
      seed: fixtures,
      failPullOnCursor: failingCursor,
    });

    const result = await pullAllPages(repository, { pageSize, startCursor: null });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.rowsPulledSoFar).toHaveLength(200);
    expect(result.cursorAtFailure).toBe(failingCursor);
    expect(result.error.kind).toBe('network');
  });

  it('5. throws when maxPages is exceeded by a non-terminating cursor', async () => {
    const repository: SyncTransportRepository<FakeRow> = {
      async pull() {
        return { status: 'succeeded', page: { items: [], nextCursor: 'always-more' } };
      },
      async push() {
        throw new Error('not used');
      },
    };

    await expect(pullAllPages(repository, { pageSize: 10, startCursor: null, maxPages: 5 })).rejects.toThrow(
      /maxPages/,
    );
  });
});

describe('pushOutboxOperations idempotency', () => {
  it('6. retrying an upsert with the same operationId after a simulated lost ack does not duplicate', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 100 });
    const operation = makeUpsertOperation({ operationId: 'op-1', recordId: 'rec-1' });

    const firstResult = await pushOutboxOperations(repository, [operation], {
      getExpectedRevision: () => null,
    });
    expect(firstResult.outcomes[0].result.status).toBe('succeeded');

    // Client never saw the ack; retries with the same operationId.
    const retryOperation = makeUpsertOperation({
      operationId: 'op-1',
      recordId: 'rec-1',
      attemptCount: 1,
    });
    const secondResult = await pushOutboxOperations(repository, [retryOperation], {
      getExpectedRevision: () => null,
    });

    expect(secondResult.outcomes[0].result.status).toBe('succeeded');
    expect(secondResult.outcomes[0].result).toEqual(firstResult.outcomes[0].result);

    const stored = repository.getStoredRow('rec-1');
    expect(stored?.revision).toBe(1);
  });

  it('7. retrying a delete with the same operationId is idempotent (tombstone unchanged)', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 200, seed: [] });

    const create = makeUpsertOperation({ operationId: 'op-create', recordId: 'rec-2' });
    await pushOutboxOperations(repository, [create], { getExpectedRevision: () => null });

    const del = makeDeleteOperation({ operationId: 'op-del', recordId: 'rec-2' });
    const firstDelete = await pushOutboxOperations(repository, [del], { getExpectedRevision: () => 1 });
    expect(firstDelete.outcomes[0].result.status).toBe('succeeded');

    const retryDel = makeDeleteOperation({ operationId: 'op-del', recordId: 'rec-2', attemptCount: 1 });
    const secondDelete = await pushOutboxOperations(repository, [retryDel], { getExpectedRevision: () => 1 });

    expect(secondDelete.outcomes[0].result).toEqual(firstDelete.outcomes[0].result);
    if (firstDelete.outcomes[0].result.status === 'succeeded' && secondDelete.outcomes[0].result.status === 'succeeded') {
      expect(secondDelete.outcomes[0].result.row.deletedAt).toBe(firstDelete.outcomes[0].result.row.deletedAt);
    }
  });
});

describe('pushOutboxOperations conflicts', () => {
  it('8. rejects a stale revision into a typed conflict without mutating the stored row', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 300, seed: [] });

    const create = makeUpsertOperation({ operationId: 'op-a', recordId: 'rec-3' });
    await pushOutboxOperations(repository, [create], { getExpectedRevision: () => null });
    const beforeConflict = repository.getStoredRow('rec-3');
    expect(beforeConflict?.revision).toBe(1);

    repository.seedRevision('rec-3', 2); // another device's edit landed first

    const staleUpsert = makeUpsertOperation({ operationId: 'op-b', recordId: 'rec-3' });
    const result = await pushOutboxOperations(repository, [staleUpsert], { getExpectedRevision: () => 1 });

    const outcome = result.outcomes[0].result;
    expect(outcome.status).toBe('conflict');
    if (outcome.status === 'conflict') {
      expect(outcome.conflict.expectedRevision).toBe(1);
      expect(outcome.conflict.serverRevision).toBe(2);
    }

    const after = repository.getStoredRow('rec-3');
    expect(after?.revision).toBe(2);
  });

  it('9. a genuine create with expectedRevision null succeeds regardless of other rows', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 400, seed: [] });
    repository.seedRevision('unrelated-record', 5);

    const create = makeUpsertOperation({ operationId: 'op-create', recordId: 'rec-new' });
    const result = await pushOutboxOperations(repository, [create], { getExpectedRevision: () => null });

    expect(result.outcomes[0].result.status).toBe('succeeded');
  });
});

describe('pushOutboxOperations server metadata authority', () => {
  it('10. returned row metadata comes from the server clock, not client-guessed payload fields', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 555 });

    const create = makeUpsertOperation({
      operationId: 'op-guess',
      recordId: 'rec-guess',
      payload: { revision: 999, updatedAt: 1, createdAt: 1, name: 'client guess' },
    });

    const result = await pushOutboxOperations(repository, [create], { getExpectedRevision: () => null });
    const outcome = result.outcomes[0].result;

    expect(outcome.status).toBe('succeeded');
    if (outcome.status === 'succeeded') {
      expect(outcome.row.revision).toBe(1);
      expect(outcome.row.updatedAt).toBe(555);
    }
  });
});

describe('pushOutboxOperations continues after one failed operation', () => {
  it('11. one conflict does not block or skip sibling operations', async () => {
    const repository = createFakeSyncTransportRepository({ now: () => 700, seed: [] });
    repository.seedRevision('rec-b', 5); // force a conflict for the middle operation

    const operations = [
      makeUpsertOperation({ operationId: 'op-x', recordId: 'rec-a' }),
      makeUpsertOperation({ operationId: 'op-y', recordId: 'rec-b' }),
      makeUpsertOperation({ operationId: 'op-z', recordId: 'rec-c' }),
    ];

    const result = await pushOutboxOperations(repository, operations, {
      getExpectedRevision: (op) => (op.recordId === 'rec-b' ? 1 : null),
    });

    expect(result.outcomes[0].result.status).toBe('succeeded');
    expect(result.outcomes[1].result.status).toBe('conflict');
    expect(result.outcomes[2].result.status).toBe('succeeded');

    expect(result.outcomes.map((o) => o.operationId)).toEqual(['op-x', 'op-y', 'op-z']);
    expect(result.outcomes.map((o) => o.recordId)).toEqual(['rec-a', 'rec-b', 'rec-c']);
  });

  it('12. one network failure does not block or skip sibling operations', async () => {
    const repository = createFakeSyncTransportRepository({
      now: () => 800,
      seed: [],
      failPushForRecordId: 'rec-fail',
    });

    const operations = [
      makeUpsertOperation({ operationId: 'op-1', recordId: 'rec-1' }),
      makeUpsertOperation({ operationId: 'op-2', recordId: 'rec-fail' }),
      makeUpsertOperation({ operationId: 'op-3', recordId: 'rec-3' }),
    ];

    const result = await pushOutboxOperations(repository, operations, { getExpectedRevision: () => null });

    expect(result.outcomes[0].result.status).toBe('succeeded');
    expect(result.outcomes[1].result.status).toBe('failed');
    expect(result.outcomes[2].result.status).toBe('succeeded');
  });
});
