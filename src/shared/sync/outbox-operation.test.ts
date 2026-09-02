import { describe, expect, it } from '@jest/globals';

import {
  createOutboxOperation,
  createOutboxOperationId,
  isOutboxOperation,
  type OutboxOperation,
} from '@/shared/sync/outbox-operation';

describe('createOutboxOperationId', () => {
  it('is deterministic given injected now/random', () => {
    expect(createOutboxOperationId(1000, 0.5)).toBe(createOutboxOperationId(1000, 0.5));
  });

  it('differs for different inputs', () => {
    expect(createOutboxOperationId(1000, 0.5)).not.toBe(createOutboxOperationId(2000, 0.5));
    expect(createOutboxOperationId(1000, 0.5)).not.toBe(createOutboxOperationId(1000, 0.75));
  });
});

describe('createOutboxOperation', () => {
  it('builds the expected shape with attemptCount 0 and null attempt fields', () => {
    const operation = createOutboxOperation(
      'op-1',
      { domain: 'goals', operationType: 'upsert', recordId: 'goal-1', payload: { name: 'A goal' } },
      1000,
    );

    expect(operation).toEqual({
      operationId: 'op-1',
      domain: 'goals',
      operationType: 'upsert',
      recordId: 'goal-1',
      payload: { name: 'A goal' },
      createdAt: 1000,
      attemptCount: 0,
      lastAttemptedAt: null,
      lastErrorMessage: null,
      lastFailureKind: null,
    });
  });
});

describe('isOutboxOperation', () => {
  const valid: OutboxOperation = {
    operationId: 'op-1',
    domain: 'goals',
    operationType: 'upsert',
    recordId: 'goal-1',
    payload: { name: 'A goal' },
    createdAt: 1000,
    attemptCount: 0,
    lastAttemptedAt: null,
    lastErrorMessage: null,
    lastFailureKind: null,
  };

  it('accepts a fully valid operation', () => {
    expect(isOutboxOperation(valid)).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(isOutboxOperation('not an object')).toBe(false);
    expect(isOutboxOperation(null)).toBe(false);
    expect(isOutboxOperation([])).toBe(false);
  });

  it('rejects a missing operationId', () => {
    const { operationId: _operationId, ...rest } = valid;
    expect(isOutboxOperation(rest)).toBe(false);
  });

  it('rejects a blank operationId', () => {
    expect(isOutboxOperation({ ...valid, operationId: '  ' })).toBe(false);
  });

  it('rejects an unknown domain', () => {
    expect(isOutboxOperation({ ...valid, domain: 'unknownDomain' })).toBe(false);
  });

  it('rejects an invalid operationType', () => {
    expect(isOutboxOperation({ ...valid, operationType: 'patch' })).toBe(false);
  });

  it('rejects a blank recordId', () => {
    expect(isOutboxOperation({ ...valid, recordId: '' })).toBe(false);
  });

  it('rejects upsert with a null payload', () => {
    expect(isOutboxOperation({ ...valid, operationType: 'upsert', payload: null })).toBe(false);
  });

  it('rejects delete with a non-null payload', () => {
    expect(
      isOutboxOperation({ ...valid, operationType: 'delete', payload: { name: 'A goal' } }),
    ).toBe(false);
  });

  it('rejects a non-finite createdAt', () => {
    expect(isOutboxOperation({ ...valid, createdAt: Number.NaN })).toBe(false);
    expect(isOutboxOperation({ ...valid, createdAt: Infinity })).toBe(false);
  });

  it('rejects a negative attemptCount', () => {
    expect(isOutboxOperation({ ...valid, attemptCount: -1 })).toBe(false);
  });

  it('rejects a non-integer attemptCount', () => {
    expect(isOutboxOperation({ ...valid, attemptCount: 1.5 })).toBe(false);
  });

  it('rejects a non-null-non-number lastAttemptedAt', () => {
    expect(isOutboxOperation({ ...valid, lastAttemptedAt: 'never' })).toBe(false);
  });

  it('rejects a non-null-non-string lastErrorMessage', () => {
    expect(isOutboxOperation({ ...valid, lastErrorMessage: 42 })).toBe(false);
  });
});
