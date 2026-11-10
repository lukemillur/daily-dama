import { describe, expect, it } from '@jest/globals';

import { AppColors } from '@/constants/theme';
import { selectHomeSceneBackground } from '@/features/profile/state/select-scene-background';

const theme = { background: '#fbdcd6' };

describe('selectHomeSceneBackground', () => {
  it('uses the resolved theme background after onboarding', () => {
    expect(selectHomeSceneBackground({ hasCompletedOnboarding: true }, theme)).toBe('#fbdcd6');
  });

  it('uses the saved onboarding background before onboarding completes', () => {
    expect(
      selectHomeSceneBackground(
        { hasCompletedOnboarding: false, themeBackgroundColor: '#101820' },
        theme,
      ),
    ).toBe('#101820');
  });

  it('falls back to yellow before onboarding when no background is saved', () => {
    expect(selectHomeSceneBackground({ hasCompletedOnboarding: false }, theme)).toBe(
      AppColors.yellow,
    );
  });
});
