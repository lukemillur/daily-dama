// T217.2: standalone feedback form. Deliberately outside the `/app/*` tabs
// tree (see src/app/feedback.tsx) so it never appears in the five-link web
// nav -- Profile only links to it (see src/app/app/profile/index.tsx),
// matching the "Profile stays a placeholder" boundary in AGENTS.md.

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { submitFeedback } from '@/features/feedback/persistence/submit-feedback';

const SUBMIT_ERROR_COPY = 'Something went wrong sending your feedback. Please try again.';

export function FeedbackScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasError, setHasError] = useState(false);

  const canSubmit = message.trim().length > 0 && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setHasError(false);

    const result = await submitFeedback({ name, email, message });
    setIsSubmitting(false);

    if (result.status === 'failed') {
      setHasError(true);
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Feedback</Eyebrow>
          <PageTitle>Thanks for the feedback.</PageTitle>
          <Introduction>We read every submission.</Introduction>
          <Button accessibilityLabel="Back to Profile" fill onPress={() => router.push('/app/profile')}>
            Back to Profile
          </Button>
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen>
      <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <FormContent>
          <Eyebrow>Feedback</Eyebrow>
          <PageTitle>Something feel off?</PageTitle>
          <Introduction>
            Daily Dama is a work in progress. Bug reports, trick corrections, and feature requests all
            help. Name and email are optional -- leave them blank to stay anonymous.
          </Introduction>

          <Field>
            <FieldLabel>Name (optional)</FieldLabel>
            <FieldInput accessibilityLabel="Name" onChangeText={setName} placeholder="Name" value={name} />
          </Field>

          <Field>
            <FieldLabel>Email (optional)</FieldLabel>
            <FieldInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              value={email}
            />
          </Field>

          <Field>
            <FieldLabel>Message</FieldLabel>
            <MessageInput
              accessibilityLabel="Message"
              multiline
              numberOfLines={6}
              onChangeText={setMessage}
              placeholder="What's on your mind?"
              value={message}
            />
          </Field>

          {hasError ? <ErrorText>{SUBMIT_ERROR_COPY}</ErrorText> : null}

          <FormActions>
            <Button accessibilityLabel="Send feedback" disabled={!canSubmit} fill onPress={submit}>
              {isSubmitting ? 'Sending...' : 'Send feedback'}
            </Button>
          </FormActions>
        </FormContent>
      </FormScroll>
    </Screen>
  );
}

const FormScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;
const FormContent = styled.View`
  width: 100%;
  max-width: 680px;
  align-self: center;
  padding: 38px 22px 0;
`;
const Centered = styled.View`
  width: 100%;
  max-width: 480px;
  align-items: center;
  padding: 38px 22px;
`;
const PageTitle = styled(DisplayTitle)`
  margin-top: 12px;
`;
const Introduction = styled(BodyText)`
  max-width: 480px;
  margin-top: 16px;
  margin-bottom: 16px;
`;
const Field = styled.View`
  margin-top: 22px;
`;
const FieldLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const FieldInput = styled(TextInput).attrs(({ theme }) => ({
  placeholderTextColor: theme.textMuted,
}))`
  min-height: 56px;
  background-color: ${({ theme }) => theme.background};
  border: 2px solid ${({ theme }) => theme.text};
  color: ${({ theme }) => theme.text};
  font-size: 18px;
  font-weight: 800;
  margin-top: 8px;
  padding: 12px 14px;
`;
const MessageInput = styled(FieldInput)`
  min-height: 140px;
  text-align-vertical: top;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 18px;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 30px;
`;
