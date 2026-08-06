import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const ACCESS_GATE_STORAGE_KEY = 'daily-dama:access-gate-unlocked';

export async function loadAccessGateUnlocked(
  storage: KeyValueStorage,
): Promise<PersistenceLoadResult<boolean>> {
  try {
    const serialized = await storage.getItem(ACCESS_GATE_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: false };

    return { status: 'loaded', value: serialized === 'true' };
  } catch (error) {
    return { status: 'recovered', value: false, error };
  }
}

export async function saveAccessGateUnlocked(
  storage: KeyValueStorage,
  unlocked: boolean,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(ACCESS_GATE_STORAGE_KEY, unlocked ? 'true' : 'false');
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}
