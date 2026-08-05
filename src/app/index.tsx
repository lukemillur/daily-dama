import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/screen';
import { AppColors } from '@/constants/theme';
import { CompletedOnboarding, KenteiOnboarding } from '@/features/onboarding/components/kentei-onboarding';
import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';

export default function HomeScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, kenteiRank, selectedTrickIds } = useUserProfile();
  const { restartOnboarding } = useUserProfileActions();

  return (
    <Screen background={AppColors.yellow} edges={['top', 'left', 'right']} webBottomInset={24}>
      {hasCompletedOnboarding && kenteiRank ? (
        <CompletedOnboarding
          rank={kenteiRank}
          selectedTrickCount={selectedTrickIds.length}
          onRetake={restartOnboarding}
          onStartSesh={() => router.push('/sesh')}
        />
      ) : (
        <KenteiOnboarding />
      )}
    </Screen>
  );
}
