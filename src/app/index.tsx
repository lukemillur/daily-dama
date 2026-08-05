import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { CompletedOnboarding, KenteiOnboarding } from '@/features/onboarding/components/kentei-onboarding';
import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';

export default function HomeScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, kenteiRank, selectedTrickIds } = useUserProfile();
  const { restartOnboarding } = useUserProfileActions();

  return (
    <Screen>
      <SafeContent edges={['top', 'left', 'right']}>
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
      </SafeContent>
    </Screen>
  );
}

const Screen = styled.View`
  flex: 1;
  width: 100%;
  background-color: #f4c94d;
`;

const SafeContent = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  padding-top: ${Platform.OS === 'web' ? 88 : 0}px;
  padding-bottom: ${Platform.OS === 'web' ? 24 : 0}px;
`;
