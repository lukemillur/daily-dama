import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';

export default function ProfileScreen() {
  return (
    <Screen align="center" edges={['top', 'left', 'right']}>
      <Content>
        <Eyebrow>Your profile</Eyebrow>
        <Title>Profile is{`\n`}taking shape.</Title>
        <Copy>Your practice tools have moved to Tricks. This space is intentionally open for what comes next.</Copy>
      </Content>
    </Screen>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  justify-content: center;
  padding: 40px 22px 140px;
`;
const Title = styled(DisplayTitle)`margin-top: 12px;`;
const Copy = styled(BodyText)`max-width: 500px; margin-top: 16px; color: ${AppColors.textMuted};`;
