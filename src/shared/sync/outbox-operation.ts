import { isSyncDomain, type SyncDomain } from '@/shared/sync/domain';

export type OutboxOperationType = 'upsert' | 'delete';
export type OutboxFailureKind = 'retryable' | 'conflict';

/**
 * One durable, serializable sync operation queued against a domain's
 * outbox. `payload` is intentionally a plain `Record<string, unknown>`, not
 * an imported `CustomTrickInsert`/`GoalInsert`/etc. -- that keeps
 * `shared/sync` decoupled from `features/*`. Each domain's sync driver
 * passes the already-mapped `*Insert` shape from its `*-cloud-mapping.ts`
 * as `payload`.
 */
export interface OutboxOperation {
  readonly operationId: string; // stable across retries; the idempotency key
  readonly domain: SyncDomain;
  readonly operationType: OutboxOperationType;
  readonly recordId: string; // the domain row's stable id (trick id, goal id, session id, ...)
  readonly payload: Record<string, unknown> | null; // non-null iff operationType === 'upsert'
  readonly createdAt: number; // caller-supplied timestamp; never Date.now() inside this module
  readonly attemptCount: number; // starts at 0, incremented by recordOutboxOperationAttempt
  readonly lastAttemptedAt: number | null;
  readonly lastErrorMessage: string | null; // plain string only -- never an Error/exception object
  readonly lastFailureKind?: OutboxFailureKind | null;
}

export interface NewOutboxOperationInput {
  readonly domain: SyncDomain;
  readonly operationType: OutboxOperationType;
  readonly recordId: string;
  readonly payload: Record<string, unknown> | null;
}

// Same deterministic-injectable-id pattern as createCustomTrickId/createGoalId
// (src/features/custom-tricks/model/custom-trick.ts, src/features/goals/model/goal.ts):
// timestamp+random base36, no crypto.randomUUID dependency, fully unit-testable.
export function createOutboxOperationId(now = Date.now(), random = Math.random()): string {
  return `op-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export function createOutboxOperation(
  operationId: string,
  input: NewOutboxOperationInput,
  createdAt: number,
): OutboxOperation {
  return {
    operationId,
    domain: input.domain,
    operationType: input.operationType,
    recordId: input.recordId,
    payload: input.payload,
    createdAt,
    attemptCount: 0,
    lastAttemptedAt: null,
    lastErrorMessage: null,
    lastFailureKind: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function isOutboxOperation(value: unknown): value is OutboxOperation {
  if (!isRecord(value)) return false;
  const {
    operationId,
    domain,
    operationType,
    recordId,
    payload,
    createdAt,
    attemptCount,
    lastAttemptedAt,
    lastErrorMessage,
    lastFailureKind,
  } = value;

  if (!isNonEmptyTrimmedString(operationId)) return false;
  if (!isSyncDomain(domain)) return false;
  if (operationType !== 'upsert' && operationType !== 'delete') return false;
  if (!isNonEmptyTrimmedString(recordId)) return false;
  if (operationType === 'upsert' && !isRecord(payload)) return false;
  if (operationType === 'delete' && payload !== null) return false;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return false;
  if (typeof attemptCount !== 'number' || !Number.isInteger(attemptCount) || attemptCount < 0) {
    return false;
  }
  if (
    lastAttemptedAt !== null &&
    (typeof lastAttemptedAt !== 'number' || !Number.isFinite(lastAttemptedAt))
  ) {
    return false;
  }
  if (lastErrorMessage !== null && typeof lastErrorMessage !== 'string') return false;
  if (lastFailureKind !== null && lastFailureKind !== 'retryable' && lastFailureKind !== 'conflict') return false;
  return true;
}
