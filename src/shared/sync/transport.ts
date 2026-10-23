import type { CloudPageRequest, CloudRepositoryError } from '@/shared/supabase/cloud-repository';
import type { OutboxOperation, OutboxOperationType } from '@/shared/sync/outbox-operation';

/**
 * Repository-agnostic transport orchestration -- stable ordered
 * pagination, mutation-id-based idempotent retries, optimistic revision
 * checks, tombstones, and application of server-returned revisions/
 * timestamps. Pure, storage-free, Supabase-free, exactly like
 * `coordinator.ts`: no `Date.now()`, no network calls, everything injected.
 *
 * This is deliberately its own abstract contract, not a wrapper around the
 * concrete `*-cloud-repository.ts` files, because none of those
 * repositories support revision-guarded conditional updates or an
 * operation_id-keyed idempotency mechanism. Each domain's
 * `*-sync-transport.ts` implements `SyncTransportRepository`.
 */

export interface SyncTransportPage<Row> {
  readonly items: readonly Row[];
  readonly nextCursor: string | null;
}

export type SyncTransportPullResult<Row> =
  | { readonly status: 'succeeded'; readonly page: SyncTransportPage<Row> }
  | { readonly status: 'failed'; readonly error: CloudRepositoryError };

export interface SyncConflict<Row = Record<string, unknown>> {
  readonly operationId: string;
  readonly recordId: string;
  readonly expectedRevision: number | null;
  readonly serverRevision: number;
  /** The validated current row, or null when the server has no row. */
  readonly serverRow?: Row | null;
}

export type SyncTransportPushResult<Row> =
  | { readonly status: 'succeeded'; readonly row: Row }
  | { readonly status: 'conflict'; readonly conflict: SyncConflict<Row> }
  | { readonly status: 'failed'; readonly error: CloudRepositoryError };

export interface SyncPushRequest {
  readonly operationId: string;
  readonly recordId: string;
  readonly operationType: OutboxOperationType;
  readonly payload: Record<string, unknown> | null;
  readonly expectedRevision: number | null; // null = "no known prior revision" (a create)
}

export interface SyncTransportRepository<Row> {
  pull(request: CloudPageRequest): Promise<SyncTransportPullResult<Row>>;
  push(request: SyncPushRequest): Promise<SyncTransportPushResult<Row>>;
}

const DEFAULT_MAX_PAGES = 10_000;

export interface PullAllPagesOptions {
  readonly pageSize: number;
  readonly startCursor: string | null;
  // Safety cap against a buggy/non-terminating nextCursor. Never hit in
  // normal operation -- throwing here mirrors `decodeCloudCursor` failing
  // loudly on a malformed cursor rather than silently truncating.
  readonly maxPages?: number;
}

export type PullAllPagesResult<Row> =
  | { readonly status: 'succeeded'; readonly rows: readonly Row[]; readonly finalCursor: null }
  | {
      readonly status: 'failed';
      readonly error: CloudRepositoryError;
      readonly rowsPulledSoFar: readonly Row[];
      readonly cursorAtFailure: string | null;
    };

export async function pullAllPages<Row>(
  repository: Pick<SyncTransportRepository<Row>, 'pull'>,
  options: PullAllPagesOptions,
): Promise<PullAllPagesResult<Row>> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  const rows: Row[] = [];
  let cursor: string | null = options.startCursor;
  let pagesFetched = 0;

  while (true) {
    if (pagesFetched >= maxPages) {
      throw new Error(
        `pullAllPages exceeded maxPages (${maxPages}) without a terminating nextCursor -- ` +
          'this indicates a buggy or non-terminating pagination cursor, not a normal outcome.',
      );
    }

    const result = await repository.pull({ limit: options.pageSize, cursor });
    pagesFetched += 1;

    if (result.status === 'failed') {
      return {
        status: 'failed',
        error: result.error,
        rowsPulledSoFar: rows,
        cursorAtFailure: cursor,
      };
    }

    rows.push(...result.page.items);
    cursor = result.page.nextCursor;

    if (cursor === null) {
      return { status: 'succeeded', rows, finalCursor: null };
    }
  }
}

export interface PushOutboxOperationsOptions {
  // Caller-supplied because "expected revision" is not part of
  // OutboxOperation. Each per-domain driver closes over its own local
  // revision cache here rather than parsing it out of `operation.payload` -- `payload` is `null` for deletes by
  // `outbox-operation.ts`'s own validation.
  readonly getExpectedRevision: (operation: OutboxOperation) => number | null;
}

export interface PushOperationOutcome<Row> {
  readonly operationId: string;
  readonly recordId: string;
  readonly result: SyncTransportPushResult<Row>;
}

export interface PushOutboxOperationsResult<Row> {
  readonly outcomes: readonly PushOperationOutcome<Row>[]; // one per input operation, same order
}

export async function pushOutboxOperations<Row>(
  repository: Pick<SyncTransportRepository<Row>, 'push'>,
  operations: readonly OutboxOperation[],
  options: PushOutboxOperationsOptions,
): Promise<PushOutboxOperationsResult<Row>> {
  const outcomes: PushOperationOutcome<Row>[] = [];

  // Sequential, not Promise.all -- outbox order is FIFO (sync-envelope.ts's
  // own outbox invariant). Never breaks/returns early on 'conflict' or
  // 'failed': this is the literal mechanism for "continue unrelated
  // operations after one conflict" (and, deliberately, after one network
  // failure too -- see plan notes).
  for (const operation of operations) {
    const result = await repository.push({
      operationId: operation.operationId,
      recordId: operation.recordId,
      operationType: operation.operationType,
      payload: operation.payload,
      expectedRevision: options.getExpectedRevision(operation),
    });

    outcomes.push({
      operationId: operation.operationId,
      recordId: operation.recordId,
      result,
    });
  }

  return { outcomes };
}
