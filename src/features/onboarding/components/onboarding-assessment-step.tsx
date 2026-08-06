import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { getCurrentAssessmentTrick, getTricksForRank } from '@/features/onboarding/model/kentei-assessment';
import { TrickCard } from '@/features/tricks/components/trick-card';

export function OnboardingAssessmentStep({
  rank,
  trickIndex,
  onLanded,
  onNotLanded,
}: {
  readonly rank: number;
  readonly trickIndex: number;
  readonly onLanded: () => void;
  readonly onNotLanded: () => void;
}) {
  const trick = getCurrentAssessmentTrick(rank, trickIndex);
  const tricksInRank = getTricksForRank(rank);

  return (
    <AssessmentScroll contentContainerStyle={{ flexGrow: 1 }}>
      <AssessmentContent>
        <TrickCard
          trick={trick}
          eyebrow="Have you landed this trick?"
          footer={`Rank ${rank} · Trick ${trickIndex + 1} of ${tricksInRank.length}`}
        />
        <Question>Can you land this trick?</Question>
        <AnswerControls>
          <AssessmentButton
            accessibilityLabel={`I cannot land ${trick.name}`}
            variant="secondary"
            onPress={onNotLanded}>
            Not yet
          </AssessmentButton>
          <AssessmentButton
            accessibilityLabel={`I can land ${trick.name}`}
            onPress={onLanded}>
            Landed it
          </AssessmentButton>
        </AnswerControls>
      </AssessmentContent>
    </AssessmentScroll>
  );
}

const AssessmentScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const AssessmentContent = styled.View`width: 100%; max-width: 720px; flex: 1; align-self: center; justify-content: center; padding: 28px 22px 116px;`;
const Question = styled.Text`color: #18382e; font-size: 22px; font-weight: 900; text-align: center; margin: 30px 0 16px;`;
const AnswerControls = styled.View`flex-direction: row; gap: 12px;`;
const AssessmentButton = styled(Button)`flex: 1;`;
