import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

export default function TricksScreen() {
  return (
    <Screen edges={['left', 'right']}>
      <Content>
        <TrickDirectory tricks={KENDAMA_KENTEI_TRICKS} />
      </Content>
    </Screen>
  );
}

const Screen = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  align-items: center;
  background-color: #efe5ca;
`;

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  overflow: hidden;
  background-color: #f8f1dd;
`;
