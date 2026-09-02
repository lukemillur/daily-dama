import { useState } from 'react';
import { TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import {
  createStreakThresholdMs,
  DEFAULT_STREAK_THRESHOLD_MS,
  isValidStreakThresholdMinutes,
} from '@/features/profile/model/user-profile';

const MIN_ONBOARDING_STREAK_MINUTES = 5;

export function OnboardingDurationStep({
  streakThresholdMs,
  onContinue,
}: {
  readonly streakThresholdMs?: number;
  readonly onContinue: (thresholdMs: number) => void;
}) {
  const persistedMinutes = (streakThresholdMs ?? DEFAULT_STREAK_THRESHOLD_MS) / 60_000;
  const [minutesText, setMinutesText] = useState(String(persistedMinutes));
  const parsedMinutes = Number(minutesText);
  const hasValidMinutes =
    isValidStreakThresholdMinutes(parsedMinutes) && parsedMinutes >= MIN_ONBOARDING_STREAK_MINUTES;

  return (
    <Content>
      <Eyebrow>Step 3 of 4</Eyebrow>
      <Title>How long would you{`\n`}like to practice a day?</Title>
      <Copy>You can change this later from your Profile.</Copy>
      <DurationField>
        <DurationLabel>Minutes</DurationLabel>
        <DurationInput
          accessibilityLabel="Practice minutes per day"
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={2}
          onChangeText={setMinutesText}
          selectTextOnFocus
          value={minutesText}
        />
        <DurationHint $invalid={!hasValidMinutes}>
          {hasValidMinutes
            ? 'Choose any whole minute from 5 to 60.'
            : 'Enter a whole number from 5 to 60.'}
        </DurationHint>
      </DurationField>
      <ContinueButton
        accessibilityLabel="Continue to theme selection"
        disabled={!hasValidMinutes}
        fill
        onPress={() => hasValidMinutes && onContinue(createStreakThresholdMs(parsedMinutes))}>
        Continue
      </ContinueButton>
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
  margin-top: 16px;
  color: ${AppColors.textMuted};
`;
const DurationField = styled.View`
  margin-top: 28px;
`;
const DurationLabel = styled.Text`
  color: ${AppColors.ink};
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 6px;
  text-transform: uppercase;
`;
const DurationInput = styled(TextInput)`
  height: 54px;
  width: 110px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
  font-size: 24px;
  font-weight: 900;
  padding: 8px 12px;
`;
const DurationHint = styled.Text<{ $invalid: boolean }>`
  color: ${({ $invalid }) => ($invalid ? AppColors.red : AppColors.textMuted)};
  font-size: 12px;
  font-weight: 700;
  margin-top: 7px;
`;
const ContinueButton = styled(Button)`
  margin-top: 30px;
  min-height: 54px;
`;
