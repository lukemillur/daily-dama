import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { Sesh } from '@/features/sesh/components/sesh';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

export default function SeshScreen() {
  const { selectedTrickIds } = useUserProfile();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Sesh selectedTrickIds={selectedTrickIds} />
    </Screen>
  );
}

const Screen = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  padding-top: ${Platform.OS === 'web' ? 88 : 0}px;
  background-color: #dfe8ca;
`;
