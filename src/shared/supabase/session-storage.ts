import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedStorage } from '@supabase/supabase-js';
import aesjs from 'aes-js';
import { Platform } from 'react-native';

export type SessionStorage = SupportedStorage;

/** Minimal async key-value surface shared by AsyncStorage and SecureStore. */
interface AsyncKeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

interface EncryptedSessionStorageDependencies {
  /** Holds only the per-install AES key. Backed by the iOS Keychain / Android Keystore. */
  readonly keyStore: AsyncKeyValueStore;
  /** Holds the encrypted session blob. A session (~2.5-4 KB) can exceed secure-store value limits. */
  readonly blobStore: AsyncKeyValueStore;
  readonly randomBytes: (length: number) => Uint8Array;
}

const BLOB_VERSION = 'v1';
const AES_KEY_BYTES = 32;
const AES_COUNTER_BYTES = 16;

function keyStoreKey(sessionKey: string): string {
  // SecureStore keys may only contain alphanumerics, `.`, `-` and `_`.
  return `${sessionKey.replace(/[^A-Za-z0-9._-]/g, '_')}.aes-key`;
}

/**
 * Supabase's documented React Native pattern: the 256-bit AES key lives in secure storage and
 * the encrypted session lives in AsyncStorage, so the plaintext refresh token never reaches
 * AsyncStorage. The session is never split across keychain items, because a partial write would
 * corrupt it.
 *
 * Failure semantics: a rejected write rejects `setItem` (supabase-js then throws out of the
 * sign-in call). Reads never throw for a missing or undecryptable blob -- that is treated as
 * signed out and the key is left in place.
 */
export function createEncryptedSessionStorage({
  keyStore,
  blobStore,
  randomBytes,
}: EncryptedSessionStorageDependencies): SessionStorage {
  async function readKey(sessionKey: string): Promise<Uint8Array | null> {
    const hex = await keyStore.getItem(keyStoreKey(sessionKey));
    if (!hex || hex.length !== AES_KEY_BYTES * 2) return null;
    return aesjs.utils.hex.toBytes(hex);
  }

  async function getOrCreateKey(sessionKey: string): Promise<Uint8Array> {
    const existing = await readKey(sessionKey);
    if (existing) return existing;
    const fresh = randomBytes(AES_KEY_BYTES);
    // The key must exist before any ciphertext is written, so a crash between the two writes
    // leaves no session (signed out) rather than an undecryptable one.
    await keyStore.setItem(keyStoreKey(sessionKey), aesjs.utils.hex.fromBytes(fresh));
    return fresh;
  }

  return {
    async getItem(sessionKey) {
      const blob = await blobStore.getItem(sessionKey);
      if (blob === null) return null;

      try {
        const [version, ivHex, cipherHex] = blob.split(':');
        if (version !== BLOB_VERSION || !ivHex || !cipherHex) return null;
        const key = await readKey(sessionKey);
        if (!key) return null;
        const counter = new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex));
        const cipher = new aesjs.ModeOfOperation.ctr(key, counter);
        return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
      } catch {
        return null;
      }
    },

    async setItem(sessionKey, value) {
      const key = await getOrCreateKey(sessionKey);
      const iv = randomBytes(AES_COUNTER_BYTES);
      const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
      const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
      await blobStore.setItem(
        sessionKey,
        `${BLOB_VERSION}:${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(encrypted)}`,
      );
    },

    async removeItem(sessionKey) {
      // Blob first: if the key removal then fails, the leftover key protects nothing.
      await blobStore.removeItem(sessionKey);
      await keyStore.removeItem(keyStoreKey(sessionKey));
    },
  };
}

let memoizedStorage: SessionStorage | undefined;

/**
 * The storage GoTrue and the optimistic cached-session read share. Web keeps plain AsyncStorage
 * (unchanged, so existing web sessions stay valid); native encrypts. Native-only modules are
 * required lazily so the web bundle and the Node static-render pass never load them.
 */
export function getSessionStorage(): SessionStorage {
  if (memoizedStorage) return memoizedStorage;

  if (Platform.OS === 'web') {
    memoizedStorage = AsyncStorage;
    return memoizedStorage;
  }

  /* eslint-disable @typescript-eslint/no-require-imports */
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  memoizedStorage = createEncryptedSessionStorage({
    keyStore: {
      getItem: (key) => SecureStore.getItemAsync(key, options),
      setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
      removeItem: (key) => SecureStore.deleteItemAsync(key, options),
    },
    blobStore: AsyncStorage,
    randomBytes: (length) => Crypto.getRandomBytes(length),
  });
  return memoizedStorage;
}

export function resetSessionStorageForTests(): void {
  memoizedStorage = undefined;
}
