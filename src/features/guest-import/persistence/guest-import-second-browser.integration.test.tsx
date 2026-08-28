/* eslint-disable import/first -- the AsyncStorage mock must be hoisted before imported modules use it. */
import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by Jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { INITIAL_CUSTOM_TRICKS, type CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { useCustomTrickDomainSync } from '@/features/custom-tricks/state/use-custom-trick-domain-sync';
import { INITIAL_GOALS, type GoalCollection } from '@/features/goals/model/goal';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { useGoalDomainSync } from '@/features/goals/state/use-goal-domain-sync';
import { INITIAL_NOTES, type NoteCollection } from '@/features/notes/model/note';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { useNoteDomainSync } from '@/features/notes/state/use-note-domain-sync';
import { INITIAL_USER_PROFILE, type UserProfile } from '@/features/profile/model/user-profile';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import { useProfileDomainSync } from '@/features/profile/state/use-profile-domain-sync';
import { INITIAL_PRACTICE_HISTORY, type PracticeHistory } from '@/features/stats/model/practice-history';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import { usePracticeHistoryDomainSync } from '@/features/stats/state/use-practice-history-domain-sync';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { SyncPushRequest, SyncTransportRepository } from '@/shared/sync/transport';
import { prepareGuestImport, runEmptyGuestImport } from './guest-import-empty-account';
import { saveCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { saveGoals } from '@/features/goals/persistence/goal-persistence';
import { saveNotes } from '@/features/notes/persistence/note-persistence';
import { savePracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
import { saveUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function storage() {
  const values = new Map<string, string>();
  return { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => void values.set(key, value) };
}

function guestView(source: ReturnType<typeof storage>) {
  return createGuestMigratingStorage(source, { getIdentity: () => GUEST_IDENTITY });
}

async function seedGuest(source: ReturnType<typeof storage>) {
  const guest = guestView(source);
  await saveUserProfile(guest, { ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 4, selectedTrickIds: ['standard-1'] });
  await saveCustomTricks(guest, { tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Orbit', kenteiRank: 4 }] });
  await savePracticeHistory(guest, { sessions: [{ id: 'session-1', trickId: 'standard-1', trickName: 'Lighthouse', startedAt: 10, completedAt: 1010, durationMs: 1000, laceCount: 3 }] });
  await saveGoals(guest, { goals: [{ id: 'goal-1', trickId: 'standard-1', trickName: 'Lighthouse', kind: 'count', targetCount: 3, createdAt: 10 }] });
  await saveNotes(guest, { notes: [{ id: 'note-1', trickId: 'standard-1', trickName: 'Lighthouse', body: 'Relax the grip', createdAt: 10, updatedAt: 10 }] });
}

type AnyRow = ProfileRow | UserTrickStateRow | CustomTrickRow | PracticeSessionRow | GoalRow | NoteRow;

function server() {
  const rows = new Map<string, AnyRow>();
  const domainRows = new Map<string, Map<string, AnyRow>>(['customTricks', 'practiceHistory', 'goals', 'notes'].map((domain) => [domain, new Map()]));
  const profile = { current: undefined as ProfileRow | undefined };
  const trickStates = new Map<string, UserTrickStateRow>();
  function rowFor(request: SyncPushRequest): AnyRow {
    const payload = request.payload ?? {};
    const previous = rows.get(request.recordId);
    return { ...payload, id: request.recordId, user_id: USER_ID, created_at: (previous as { created_at?: string } | undefined)?.created_at ?? TIMESTAMP, updated_at: TIMESTAMP, revision: ((previous as { revision?: number } | undefined)?.revision ?? 0) + 1 } as AnyRow;
  }
  function push(request: SyncPushRequest, domain?: string) {
    const row = rowFor(request);
    rows.set(request.recordId, row);
    if (domain) domainRows.get(domain)?.set(request.recordId, row);
    if (request.recordId === USER_ID) profile.current = row as ProfileRow;
    else if ('is_selected' in row) trickStates.set(String((row as UserTrickStateRow).trick_id), row as UserTrickStateRow);
    return Promise.resolve({ status: 'succeeded' as const, row });
  }
  const repo = <Row extends AnyRow>(domain: string): SyncTransportRepository<Row> => ({
    pull: async () => ({ status: 'succeeded', page: { items: [...(domainRows.get(domain)?.values() ?? [])] as Row[], nextCursor: null } }),
    push: async (request) => ({ ...(await push(request, domain)), row: rows.get(request.recordId) as Row }),
  });
  const profileTransport: ProfileSyncTransport = {
    pullProfileRow: async () => ({ status: 'succeeded', page: { items: profile.current ? [profile.current] : [], nextCursor: null } }),
    pullTrickStatePage: async () => ({ status: 'succeeded', page: { items: [...trickStates.values()], nextCursor: null } }),
    push: async (request) => {
      const result = await push(request, request.recordId === USER_ID ? undefined : 'profile');
      return { status: 'succeeded', row: result.row as ProfileRow };
    },
  };
  return { repo, profileTransport, rows, profile };
}

function IdentityProvider({ children }: PropsWithChildren) {
  const [context] = useState(() => createIdentityContext(USER));
  return <IdentityHandleContext.Provider value={{ identity: USER, generation: context.getGeneration(), context }}>{children}</IdentityHandleContext.Provider>;
}

interface Captured { profile?: UserProfile; custom?: CustomTrickCollection; history?: PracticeHistory; goals?: GoalCollection; notes?: NoteCollection; sync?: { run: () => Promise<unknown> } }

function Browser({ transports, captured }: { transports: ReturnType<typeof server>; captured: Captured }) {
  const [profile, setProfile] = useState(INITIAL_USER_PROFILE);
  const [custom, setCustom] = useState(INITIAL_CUSTOM_TRICKS);
  const [history, setHistory] = useState(INITIAL_PRACTICE_HISTORY);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const profileSync = useProfileDomainSync({ profile, hasHydratedProfile: true, dispatchProfile: (a) => { if (a.type === 'profileRestored') setProfile(a.profile); }, getTransport: () => transports.profileTransport });
  const customSync = useCustomTrickDomainSync({ collection: custom, hasHydratedCollection: true, dispatchCollection: (a) => { if (a.type === 'customTricksRestored') setCustom(a.collection); }, getTransport: () => transports.repo('customTricks') });
  const historySync = usePracticeHistoryDomainSync({ history, hasHydratedHistory: true, dispatchHistory: (a) => { if (a.type === 'historyRestored') setHistory(a.history); }, getTransport: () => transports.repo('practiceHistory') });
  const goalSync = useGoalDomainSync({ collection: goals, hasHydratedCollection: true, dispatchCollection: (a) => { if (a.type === 'goalsRestored') setGoals(a.collection); }, getTransport: () => transports.repo('goals') });
  const noteSync = useNoteDomainSync({ collection: notes, hasHydratedCollection: true, dispatchCollection: (a) => { if (a.type === 'notesRestored') setNotes(a.collection); }, getTransport: () => transports.repo('notes') });
  // eslint-disable-next-line react-hooks/immutability -- test harness captures observable state from the mounted browser.
  useEffect(() => { captured.profile = profile; captured.custom = custom; captured.history = history; captured.goals = goals; captured.notes = notes; captured.sync = { run: async () => { await Promise.all([profileSync.runSync('manual'), customSync.runSync('manual'), historySync.runSync('manual'), goalSync.runSync('manual'), noteSync.runSync('manual')]); } }; });
  return null;
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }

describe('guest import second-browser integration', () => {
  it('rehydrates the complete five-domain import through fresh runtime sync drivers', async () => {
    await AsyncStorage.clear();
    const source = storage();
    await seedGuest(source);
    const destination = server();
    const prepared = await prepareGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, importId: 'import-browser', createdAt: 1, createOperationId: (domain, id) => `operation:${domain}:${id}` });
    let progress = prepared.progress;
    const result = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress, repositories: { profile: destination.profileTransport, customTricks: destination.repo('customTricks'), practiceHistory: destination.repo('practiceHistory'), goals: destination.repo('goals'), notes: destination.repo('notes') }, saveProgress: async (next) => { progress = next; } });
    expect(result.status).toBe('completed');
    expect(destination.rows.size).toBe(6);

    const captured: Captured = {};
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<IdentityProvider><Browser transports={destination} captured={captured} /></IdentityProvider>); });
    await flush();
    await act(async () => { await captured.sync?.run(); });
    await flush();

    expect(captured.profile).toEqual({ ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 4, selectedTrickIds: ['standard-1'], manuallyUnlockedTrickIds: [] });
    expect(captured.custom?.tricks.map((item) => item.id)).toEqual(['custom-1']);
    expect(captured.history?.sessions.map((item) => item.id)).toEqual(['session-1']);
    expect(captured.goals?.goals.map((item) => item.id)).toEqual(['goal-1']);
    expect(captured.notes?.notes.map((item) => item.id)).toEqual(['note-1']);
    await act(async () => {
      root.unmount();
    });
  });
});
