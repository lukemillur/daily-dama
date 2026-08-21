import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { KenteiOnboarding } from '@/features/onboarding/components/kentei-onboarding';
import { getCurrentAssessmentTrick } from '@/features/onboarding/model/kentei-assessment';
import { RAINBOW_THEME_PRESETS } from '@/features/profile/model/theme-presets';
import {
  deserializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = findByAccessibilityLabel(root, label).filter(
    (node) => typeof node.props.onPress === 'function',
  );
  if (!match) throw new Error('No pressable found with accessibilityLabel: ' + label);
  match.props.onPress();
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error('No node found with text: ' + text);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) throw new Error('No pressable ancestor found for text: ' + text);
  current.props.onPress();
}

async function mountOnboarding() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <KenteiOnboarding />
      </UserProfileProvider>,
    );
  });
  return root;
}

async function driveToThemeSelect(root: ReactTestRenderer) {
  act(() => pressByVisibleText(root, 'Get started'));
  act(() =>
    pressByAccessibilityLabel(
      root,
      'Basic. New to kendama or still building your cup and spike fundamentals.',
    ),
  );

  const firstRank1Trick = getCurrentAssessmentTrick(1, 0);
  act(() => pressByAccessibilityLabel(root, 'I cannot land ' + firstRank1Trick.name));

  act(() => pressByVisibleText(root, 'Choose tricks'));

  const rank1TrickIds = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map(
    (trick) => trick.id,
  );
  const [firstTrickId] = rank1TrickIds;
  const firstTrickName = KENDAMA_KENTEI_TRICKS.find((trick) => trick.id === firstTrickId)!.name;
  act(() => pressByAccessibilityLabel(root, firstTrickName + ', not selected'));

  act(() => pressByVisibleText(root, 'Start practicing'));
}

async function readPersistedProfile() {
  const persisted = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
  expect(persisted).not.toBeNull();
  return deserializeUserProfile(persisted!);
}

describe('KenteiOnboarding', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
  });

  it('previews a preset without finishing onboarding', async () => {
    const root = await mountOnboarding();
    await driveToThemeSelect(root);

    expect(
      root.root.findAll((node) => node.props.children === 'Select a theme that matches your setup.').length,
    ).toBeGreaterThan(0);

    const preset = RAINBOW_THEME_PRESETS[2];
    act(() => pressByAccessibilityLabel(root, preset.label + ' theme preset'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();

    const [swatch] = findByAccessibilityLabel(root, preset.label + ' theme preset');
    expect(swatch.props.accessibilityState.selected).toBe(true);

    const profile = await readPersistedProfile();
    expect(profile?.themeBackgroundColor).toBe(preset.backgroundColor);
    expect(profile?.themeAccentColor).toBe(preset.accentColor);
    expect(profile?.hasCompletedOnboarding).toBe(false);
  });

  it('finishes onboarding after previewing a preset, matching a direct Profile selection', async () => {
    const root = await mountOnboarding();
    await driveToThemeSelect(root);

    const preset = RAINBOW_THEME_PRESETS[2];
    act(() => pressByAccessibilityLabel(root, preset.label + ' theme preset'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();

    act(() => pressByAccessibilityLabel(root, 'Finish onboarding'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/sesh');

    const profile = await readPersistedProfile();
    expect(profile?.themeBackgroundColor).toBe(preset.backgroundColor);
    expect(profile?.themeAccentColor).toBe(preset.accentColor);
    expect(profile?.hasCompletedOnboarding).toBe(true);
    expect(profile?.kenteiRank).toBe(1);
    expect(profile?.selectedTrickIds.length).toBeGreaterThan(0);
  });

  it('completes onboarding normally with no theme preference set when the step is skipped', async () => {
    const root = await mountOnboarding();
    await driveToThemeSelect(root);

    act(() => pressByAccessibilityLabel(root, 'Skip theme selection'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/sesh');

    const profile = await readPersistedProfile();
    expect(profile?.themeBackgroundColor).toBeUndefined();
    expect(profile?.themeAccentColor).toBeUndefined();
    expect(profile?.hasCompletedOnboarding).toBe(true);
    expect(profile?.kenteiRank).toBe(1);
    expect(profile?.selectedTrickIds.length).toBeGreaterThan(0);
  });
});
