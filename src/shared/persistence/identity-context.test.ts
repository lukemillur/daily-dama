import { describe, expect, it } from '@jest/globals';

import { createIdentityContext, withGenerationGuard } from '@/shared/persistence/identity-context';
import type { Identity } from '@/shared/persistence/identity';

const USER_A: Identity = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
const USER_B: Identity = { kind: 'user', userId: '22222222-2222-2222-2222-222222222222' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createIdentityContext', () => {
  it('increments generation when switching to a genuinely different identity', () => {
    const context = createIdentityContext();
    expect(context.getGeneration()).toBe(0);

    const gen1 = context.setIdentity(USER_A);
    expect(gen1).toBe(1);
    expect(context.getGeneration()).toBe(1);
    expect(context.getIdentity()).toEqual(USER_A);
  });

  it('does not bump generation on a repeated same-identity call', () => {
    const context = createIdentityContext();
    context.setIdentity(USER_A);
    expect(context.getGeneration()).toBe(1);

    const gen2 = context.setIdentity({ kind: 'user', userId: USER_A.userId });
    expect(gen2).toBe(1);
    expect(context.getGeneration()).toBe(1);

    // Same guest identity called repeatedly (e.g. repeated TOKEN_REFRESHED-equivalent events).
    const guestContext = createIdentityContext();
    guestContext.setIdentity({ kind: 'guest' });
    guestContext.setIdentity({ kind: 'guest' });
    expect(guestContext.getGeneration()).toBe(0);
  });

  it('isCurrentGeneration reflects generation before and after an identity change', () => {
    const context = createIdentityContext();
    const capturedBefore = context.getGeneration();
    expect(context.isCurrentGeneration(capturedBefore)).toBe(true);

    // No-op identity change: captured generation is still current.
    context.setIdentity({ kind: 'guest' });
    expect(context.isCurrentGeneration(capturedBefore)).toBe(true);

    // Genuine identity change: previously captured generation is now stale.
    context.setIdentity(USER_A);
    expect(context.isCurrentGeneration(capturedBefore)).toBe(false);
  });
});

describe('withGenerationGuard', () => {
  it('discards a late result when the identity changes mid-flight', async () => {
    const context = createIdentityContext();
    const gate = deferred<string>();

    const resultPromise = withGenerationGuard(context, () => gate.promise);

    // Identity moves on while the operation is still in flight.
    context.setIdentity(USER_A);
    gate.resolve('late-value');

    const result = await resultPromise;
    expect(result).toEqual({ status: 'stale' });
  });

  it('applies the result when the identity does not change while in flight', async () => {
    const context = createIdentityContext();
    const gate = deferred<string>();

    const resultPromise = withGenerationGuard(context, () => gate.promise);
    gate.resolve('fresh-value');

    const result = await resultPromise;
    expect(result).toEqual({ status: 'applied', value: 'fresh-value' });
  });

  it('applies the result when an in-flight setIdentity call does not change identity', async () => {
    const context = createIdentityContext();
    const gate = deferred<string>();

    const resultPromise = withGenerationGuard(context, () => gate.promise);
    context.setIdentity({ kind: 'guest' }); // no-op, no generation bump
    gate.resolve('fresh-value');

    const result = await resultPromise;
    expect(result).toEqual({ status: 'applied', value: 'fresh-value' });
  });

  it('never reports applied once the identity has changed', async () => {
    const context = createIdentityContext();
    const gate = deferred<string>();

    const resultPromise = withGenerationGuard(context, () => gate.promise);
    context.setIdentity(USER_A);
    context.setIdentity(USER_B);
    gate.resolve('late-value');

    const result = await resultPromise;
    expect(result.status).toBe('stale');
    expect(result).not.toEqual({ status: 'applied', value: 'late-value' });
  });
});
