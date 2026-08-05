import { useRouter } from 'expo-router';
import { useReducer } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import {
  getRepresentativeTrick,
  getTricksForRank,
  INITIAL_KENTEI_ASSESSMENT,
  kenteiAssessmentReducer,
} from '@/features/onboarding/model/kentei-assessment';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { TrickCard } from '@/features/tricks/components/trick-card';
import { TrickDirectory } from '@/features/tricks/components/trick-directory';

export function KenteiOnboarding() {
  const router = useRouter();
  const [state, dispatch] = useReducer(kenteiAssessmentReducer, INITIAL_KENTEI_ASSESSMENT);
  const { completeOnboarding } = useUserProfileActions();

  if (state.status === 'assessing') {
    const trick = getRepresentativeTrick(state.rank);
    return (
      <AssessmentScroll contentContainerStyle={{ flexGrow: 1 }}>
        <AssessmentContent>
          <TrickCard
            trick={trick}
            eyebrow="Find your starting rank"
            footer={`Assessment ${state.rank} of 12`}
          />
          <Question>Can you land this trick?</Question>
          <AnswerControls>
            <AssessmentButton
              accessibilityLabel={`I cannot land ${trick.name}`}
              variant="secondary"
              onPress={() => dispatch({ type: 'trickNotLanded' })}>
              Not yet
            </AssessmentButton>
            <AssessmentPrimaryAnswer
              accessibilityLabel={`I can land ${trick.name}`}
              onPress={() => dispatch({ type: 'trickLanded' })}>
              Landed it
            </AssessmentPrimaryAnswer>
          </AnswerControls>
        </AssessmentContent>
      </AssessmentScroll>
    );
  }

  const rankTricks = getTricksForRank(state.rank);
  const selectedCount = state.selectedTrickIds.length;

  const finishOnboarding = () => {
    if (selectedCount === 0) return;
    completeOnboarding(state.rank, state.selectedTrickIds);
    router.replace('/sesh');
  };

  return (
    <SelectionContent>
      <TrickDirectory
        tricks={rankTricks}
        fixedHeader
        fixedFooter
        hideScrollIndicator
        selection={{
          selectedTrickIds: state.selectedTrickIds,
          onToggleTrick: (trickId) => dispatch({ type: 'practiceTrickToggled', trickId }),
        }}
        header={{
          eyebrow: `Your practice frontier · Rank ${state.rank}`,
          title: 'Choose what to\nwork on first.',
          introduction: `Select one or more Rank ${state.rank} tricks. These will become your initial Sesh practice list.`,
        }}
        footer={
          <FinishBackdrop>
            <FinishArea>
              <SelectionCount>
                {selectedCount === 0
                  ? 'Select at least one trick to continue.'
                  : `${selectedCount} ${selectedCount === 1 ? 'trick' : 'tricks'} selected.`}
              </SelectionCount>
              <FinishButton
                disabled={selectedCount === 0}
                onPress={finishOnboarding}>
                Start practicing
              </FinishButton>
            </FinishArea>
          </FinishBackdrop>
        }
      />
    </SelectionContent>
  );
}

interface CompletedOnboardingProps {
  readonly rank: number;
  readonly selectedTrickCount: number;
  readonly onRetake: () => void;
  readonly onStartSesh: () => void;
}

export function CompletedOnboarding({ rank, selectedTrickCount, onRetake, onStartSesh }: CompletedOnboardingProps) {
  return (
    <CompletedContent>
      <CompletedEyebrow>Assessment complete</CompletedEyebrow>
      <RankNumber>{rank}</RankNumber>
      <CompletedTitle>Your current{`\n`}Kentei rank.</CompletedTitle>
      <CompletedCopy>
        You have {selectedTrickCount} {selectedTrickCount === 1 ? 'trick' : 'tricks'} queued for focused practice.
      </CompletedCopy>
      <CompletedPrimaryAnswer onPress={onStartSesh}>
        Start a sesh
      </CompletedPrimaryAnswer>
      <RetakeButton accessibilityRole="button" onPress={onRetake}>
        <RetakeText>Retake assessment</RetakeText>
      </RetakeButton>
    </CompletedContent>
  );
}

const AssessmentScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const AssessmentContent = styled.View`width: 100%; max-width: 720px; flex: 1; align-self: center; justify-content: center; padding: 28px 22px 116px;`;
const Question = styled.Text`color: #18382e; font-size: 22px; font-weight: 900; text-align: center; margin: 30px 0 16px;`;
const AnswerControls = styled.View`flex-direction: row; gap: 12px;`;
const AssessmentButton = styled(Button)`flex: 1;`;
const AssessmentPrimaryAnswer = styled(AssessmentButton)``;
const CompletedPrimaryAnswer = styled(Button)`min-width: 190px;`;
const SelectionContent = styled.View`width: 100%; max-width: 760px; max-height: 864px; flex: 1; align-self: center; overflow: hidden; background-color: ${AppColors.paper}; border-radius: ${Radii.panel}px;`;
const FinishBackdrop = styled.View`background-color: ${AppColors.yellow};`;
const FinishArea = styled.View`align-items: center; margin-top: 54px; padding: 20px 22px 22px; background-color: ${AppColors.paper}; border-top-width: 1px; border-top-color: ${AppColors.borderMuted};`;
const SelectionCount = styled.Text`color: ${AppColors.textMuted}; font-size: 14px; font-weight: 700; margin-bottom: 12px;`;
const FinishButton = styled(Button).attrs({ fill: true })`min-height: 54px;`;
const CompletedContent = styled.View`width: 100%; max-width: 620px; flex: 1; align-self: center; align-items: center; justify-content: center; padding: 40px 22px 130px;`;
const CompletedEyebrow = styled(Eyebrow)`letter-spacing: 2px;`;
const RankNumber = styled.Text`color: ${AppColors.red}; font-size: 150px; font-weight: 900; letter-spacing: -10px; line-height: 165px;`;
const CompletedTitle = styled(DisplayTitle)`font-size: 40px; line-height: 43px; letter-spacing: -1px; text-align: center;`;
const CompletedCopy = styled(BodyText)`max-width: 440px; text-align: center; margin: 16px 0 26px;`;
const RetakeButton = styled(Pressable)`padding: 16px; margin-top: 8px;`;
const RetakeText = styled.Text`color: ${AppColors.ink}; font-size: 14px; font-weight: 800; text-decoration-line: underline;`;
