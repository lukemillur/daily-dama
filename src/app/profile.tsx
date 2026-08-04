import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

export default function ProfileScreen() {
  const { selectedTrickIds } = useUserProfile();
  const { toggleSelectedTrick } = useUserProfileActions();

  return (
    <Screen edges={['left', 'right']}>
      <Content>
        <TrickDirectory
          tricks={KENDAMA_KENTEI_TRICKS}
          selection={{ selectedTrickIds, onToggleTrick: toggleSelectedTrick }}
          header={{
            eyebrow: 'Your profile',
            title: 'What are you\nworking on?',
            introduction:
              selectedTrickIds.length === 0
                ? 'Select the tricks you want to focus on. Your practice list will appear here as you build it.'
                : `${selectedTrickIds.length} ${selectedTrickIds.length === 1 ? 'trick' : 'tricks'} selected for focused practice.`,
          }}
        />
      </Content>
    </Screen>
  );
}

const Screen = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  align-items: center;
  background-color: #dfe8ca;
`;

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  overflow: hidden;
  background-color: #f8f1dd;
`;
