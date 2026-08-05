import { useMemo, useState } from 'react';

import { Screen } from '@/components/ui/screen';
import { AppColors } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { DailyHome } from '@/features/home/components/daily-home';
import { createHomeSummary } from '@/features/home/model/home-summary';
import { KenteiOnboarding } from '@/features/onboarding/components/kentei-onboarding';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

export default function HomeScreen() {
  const profile = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const { sessions } = usePracticeHistory();
  const [now] = useState(Date.now);
  const summary = useMemo(
    () =>
      createHomeSummary({
        profile,
        standardTricks: KENDAMA_KENTEI_TRICKS,
        customTricks,
        sessions,
        now,
      }),
    [customTricks, now, profile, sessions],
  );

  return (
    <Screen
      background={profile.hasCompletedOnboarding ? AppColors.sage : AppColors.yellow}
      edges={['top', 'left', 'right']}
      webBottomInset={24}>
      {profile.hasCompletedOnboarding && profile.kenteiRank ? <DailyHome summary={summary} /> : <KenteiOnboarding />}
    </Screen>
  );
}
