import { useMemo } from 'react';
import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { AppColors } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { createProfileDirectoryTricks } from '@/features/tricks/model/trick-directory';

export default function ProfileScreen() {
  const { selectedTrickIds } = useUserProfile();
  const { toggleSelectedTrick } = useUserProfileActions();
  const { tricks: customTricks } = useCustomTricks();
  const directoryTricks = useMemo(
    () => createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );

  return (
    <Screen align="center" edges={['left', 'right']} includeWebHeaderInset={false}>
      <Content>
        <TrickDirectory
          tricks={directoryTricks}
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

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  overflow: hidden;
  background-color: ${AppColors.paper};
`;
