import { useState } from 'react';
import { TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useAccessGateActions } from '@/features/access-gate/state/access-gate-context';

export function AccessGateScreen() {
  const { attemptUnlock } = useAccessGateActions();
  const [password, setPassword] = useState('');
  const [hasFailedAttempt, setHasFailedAttempt] = useState(false);

  const submit = () => {
    const isCorrect = attemptUnlock(password);
    if (!isCorrect) {
      setHasFailedAttempt(true);
      setPassword('');
    }
  };

  return (
    <Screen align="center" background={AppColors.paper} edges={['top', 'bottom', 'left', 'right']}>
      <Content>
        <Eyebrow>Daily Dama</Eyebrow>
        <Title>This one{`\n`}needs a password.</Title>
        <Copy>Enter the password to keep practicing.</Copy>
        <PasswordInput
          accessibilityLabel="Password"
          autoFocus
          onChangeText={(value) => {
            setPassword(value);
            setHasFailedAttempt(false);
          }}
          onSubmitEditing={submit}
          placeholder="Password"
          placeholderTextColor={AppColors.textSubtle}
          returnKeyType="go"
          secureTextEntry
          value={password}
        />
        {hasFailedAttempt && <ErrorText>That password isn&rsquo;t right. Try again.</ErrorText>}
        <SubmitButton disabled={password.length === 0} onPress={submit}>
          Enter
        </SubmitButton>
      </Content>
    </Screen>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 420px;
  padding: 40px 22px;
`;
const Title = styled(DisplayTitle)`margin-top: 10px; font-size: 34px; line-height: 36px;`;
const Copy = styled(BodyText)`margin-top: 16px;`;
const PasswordInput = styled(TextInput)`
  height: 54px;
  margin-top: 26px;
  background-color: ${AppColors.cream};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
  font-size: 18px;
  font-weight: 700;
  padding: 8px 14px;
`;
const ErrorText = styled.Text`color: ${AppColors.red}; font-size: 13px; font-weight: 700; margin-top: 10px;`;
const SubmitButton = styled(Button)`align-self: flex-start; margin-top: 22px;`;
