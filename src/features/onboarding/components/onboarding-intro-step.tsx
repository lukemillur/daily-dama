import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";

export function OnboardingIntroStep({
  onContinue,
}: {
  readonly onContinue: () => void;
}) {
  return (
    <Content>
      <Eyebrow>Before you start</Eyebrow>
      <Title>Let&rsquo;s find{`\n`}your rank.</Title>
      <Copy>
        A quick skill check places you on the Kentei ladder so Daily Dama can
        start you at the right level.
      </Copy>
      <ContinueButton onPress={onContinue}>Get started</ContinueButton>
    </Content>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 620px;
  flex: 1;
  align-self: center;
  justify-content: center;
  padding: 40px 22px 130px;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 480px;
  margin-top: 18px;
  color: ${AppColors.textMuted};
`;
const ContinueButton = styled(Button)`
  align-self: flex-start;
  margin-top: 30px;
`;
