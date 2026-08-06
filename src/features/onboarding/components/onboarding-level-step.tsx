import { Pressable } from 'react-native';
import { styled } from 'styled-components/native';

import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { KENTEI_LEVELS, type KenteiLevel } from '@/features/tricks/model/trick';

const LEVEL_DESCRIPTIONS: Record<KenteiLevel, string> = {
  Basic: 'New to kendama or still building your cup and spike fundamentals.',
  Advanced: 'Comfortable with cup tricks and starting to build spike control.',
  Expert: 'Landing multi-turn tricks and stringing together combos.',
  Master: 'Competition-level tricks and technical juggling combos.',
};

export function OnboardingLevelStep({
  onSelect,
}: {
  readonly onSelect: (level: KenteiLevel) => void;
}) {
  return (
    <Content>
      <Eyebrow>Step 1 of 3</Eyebrow>
      <Title>Where&rsquo;s your{`\n`}skill level?</Title>
      <Copy>Pick where you&rsquo;d place yourself. We&rsquo;ll start the check there.</Copy>
      <Choices accessibilityRole="radiogroup">
        {KENTEI_LEVELS.map((level) => (
          <Choice
            key={level}
            accessibilityLabel={`${level}. ${LEVEL_DESCRIPTIONS[level]}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: false }}
            onPress={() => onSelect(level)}>
            <ChoiceIdentity>
              <ChoiceTitle>{level}</ChoiceTitle>
              <ChoiceCopy>{LEVEL_DESCRIPTIONS[level]}</ChoiceCopy>
            </ChoiceIdentity>
            <ChoiceArrow>→</ChoiceArrow>
          </Choice>
        ))}
      </Choices>
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
const Title = styled(DisplayTitle)`margin-top: 10px;`;
const Copy = styled(BodyText)`margin-top: 16px; color: ${AppColors.textMuted};`;
const Choices = styled.View`gap: 12px; margin-top: 28px;`;
const Choice = styled(Pressable)`
  min-height: 76px;
  flex-direction: row;
  align-items: center;
  gap: 14px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  padding: 16px 18px;
`;
const ChoiceIdentity = styled.View`flex: 1;`;
const ChoiceTitle = styled.Text`color: ${AppColors.ink}; font-size: 18px; font-weight: 900;`;
const ChoiceCopy = styled.Text`color: ${AppColors.textMuted}; font-size: 13px; font-weight: 700; margin-top: 3px;`;
const ChoiceArrow = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900;`;
