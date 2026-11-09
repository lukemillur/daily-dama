import { describe, expect, it, jest } from '@jest/globals';

import { createEncryptedSessionStorage } from '@/shared/supabase/session-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SESSION_KEY = 'sb-127-auth-token';
const REFRESH_TOKEN = 'plaintext-refresh-token-abc123';
const SESSION_JSON = JSON.stringify({
  access_token: 'a.b.c',
  refresh_token: REFRESH_TOKEN,
  user: { id: 'u1', email: 'a@b.com' },
});

function createFakes() {
  const secure = new Map<string, string>();
  const blobs = new Map<string, string>();
  const failures = { secureSet: false, blobSet: false };
  let counter = 0;

  const adapter = createEncryptedSessionStorage({
    keyStore: {
      getItem: async (key) => secure.get(key) ?? null,
      setItem: async (key, value) => {
        if (failures.secureSet) throw new Error('keychain unavailable');
        secure.set(key, value);
      },
      removeItem: async (key) => void secure.delete(key),
    },
    blobStore: {
      getItem: async (key) => blobs.get(key) ?? null,
      setItem: async (key, value) => {
        if (failures.blobSet) throw new Error('disk full');
        blobs.set(key, value);
      },
      removeItem: async (key) => void blobs.delete(key),
    },
    randomBytes: (length) => new Uint8Array(length).map(() => (counter += 7) % 256),
  });

  return { adapter, secure, blobs, failures };
}

describe('createEncryptedSessionStorage', () => {
  it('(a) writes the key to secure storage and only ciphertext to the blob store', async () => {
    const { adapter, secure, blobs } = createFakes();

    await adapter.setItem(SESSION_KEY, SESSION_JSON);

    expect([...secure.keys()]).toEqual([`${SESSION_KEY}.aes-key`]);
    const blob = blobs.get(SESSION_KEY)!;
    expect(blob).not.toContain(REFRESH_TOKEN);
    expect(blob).not.toContain('refresh_token');
    expect(() => JSON.parse(blob)).toThrow();
    for (const value of blobs.values()) {
      expect(value).not.toContain(REFRESH_TOKEN);
    }
  });

  it('round-trips the original string, including non-ASCII, and reuses one key', async () => {
    const { adapter, secure } = createFakes();
    const value = JSON.stringify({ name: 'Dāma 玉', token: REFRESH_TOKEN });

    await adapter.setItem(SESSION_KEY, value);
    const keyAfterFirst = [...secure.values()][0];
    await adapter.setItem(SESSION_KEY, SESSION_JSON);

    expect([...secure.values()][0]).toBe(keyAfterFirst);
    expect(await adapter.getItem(SESSION_KEY)).toBe(SESSION_JSON);
    await adapter.setItem(SESSION_KEY, value);
    expect(await adapter.getItem(SESSION_KEY)).toBe(value);
  });

  it('uses a fresh IV per write', async () => {
    const { adapter, blobs } = createFakes();
    await adapter.setItem(SESSION_KEY, SESSION_JSON);
    const first = blobs.get(SESSION_KEY);
    await adapter.setItem(SESSION_KEY, SESSION_JSON);
    expect(blobs.get(SESSION_KEY)).not.toBe(first);
  });

  it('returns null, without throwing or removing anything, for a missing, corrupt, or keyless blob', async () => {
    const { adapter, secure, blobs } = createFakes();

    expect(await adapter.getItem(SESSION_KEY)).toBeNull();

    blobs.set(SESSION_KEY, 'not-a-blob');
    expect(await adapter.getItem(SESSION_KEY)).toBeNull();

    await adapter.setItem(SESSION_KEY, SESSION_JSON);
    secure.clear(); // keychain item lost while the blob survived
    expect(await adapter.getItem(SESSION_KEY)).toBeNull();
    expect(blobs.has(SESSION_KEY)).toBe(true);
  });

  it('removeItem clears both stores', async () => {
    const { adapter, secure, blobs } = createFakes();
    await adapter.setItem(SESSION_KEY, SESSION_JSON);

    await adapter.removeItem(SESSION_KEY);

    expect(secure.size).toBe(0);
    expect(blobs.size).toBe(0);
    expect(await adapter.getItem(SESSION_KEY)).toBeNull();
  });

  it('rejects setItem when the secure-store write fails, and writes no blob', async () => {
    const { adapter, blobs, failures } = createFakes();
    failures.secureSet = true;

    await expect(adapter.setItem(SESSION_KEY, SESSION_JSON)).rejects.toThrow('keychain unavailable');
    expect(blobs.size).toBe(0);
  });

  it('rejects setItem when the blob write fails', async () => {
    const { adapter, failures } = createFakes();
    failures.blobSet = true;

    await expect(adapter.setItem(SESSION_KEY, SESSION_JSON)).rejects.toThrow('disk full');
  });
});
