import { useRouter } from 'expo-router';
import { useReducer } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

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
            <SecondaryAnswer
              accessibilityLabel={`I cannot land ${trick.name}`}
              accessibilityRole="button"
              onPress={() => dispatch({ type: 'trickNotLanded' })}>
              <SecondaryAnswerText>Not yet</SecondaryAnswerText>
            </SecondaryAnswer>
            <AssessmentPrimaryAnswer
              accessibilityLabel={`I can land ${trick.name}`}
              accessibilityRole="button"
              onPress={() => dispatch({ type: 'trickLanded' })}>
              <PrimaryAnswerText>Landed it</PrimaryAnswerText>
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
                accessibilityRole="button"
                disabled={selectedCount === 0}
                onPress={finishOnboarding}>
                <FinishButtonText>Start practicing</FinishButtonText>
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
      <CompletedPrimaryAnswer accessibilityRole="button" onPress={onStartSesh}>
        <PrimaryAnswerText>Start a sesh</PrimaryAnswerText>
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
const PrimaryAnswer = styled(Pressable)`min-height: 56px; align-items: center; justify-content: center; background-color: #18382e; border: 2px solid #18382e; border-radius: 4px; padding: 12px 20px;`;
const AssessmentPrimaryAnswer = styled(PrimaryAnswer)`flex: 1;`;
const CompletedPrimaryAnswer = styled(PrimaryAnswer)`min-width: 190px;`;
const PrimaryAnswerText = styled.Text`color: #f4c94d; font-size: 17px; font-weight: 900;`;
const SecondaryAnswer = styled(Pressable)`min-height: 56px; flex: 1; align-items: center; justify-content: center; background-color: #f6efd9; border: 2px solid #18382e; border-radius: 4px; padding: 12px 20px;`;
const SecondaryAnswerText = styled.Text`color: #18382e; font-size: 17px; font-weight: 900;`;
const SelectionContent = styled.View`width: 100%; max-width: 760px; max-height: 864px; flex: 1; align-self: center; overflow: hidden; background-color: #f8f1dd; border-radius: 6px;`;
const FinishBackdrop = styled.View`background-color: #f4c94d;`;
const FinishArea = styled.View`align-items: center; margin-top: 54px; padding: 20px 22px 22px; background-color: #f8f1dd; border-top-width: 1px; border-top-color: #d8cfb7;`;
const SelectionCount = styled.Text`color: #53635d; font-size: 14px; font-weight: 700; margin-bottom: 12px;`;
const FinishButton = styled(Pressable)`width: 100%; min-height: 54px; align-items: center; justify-content: center; background-color: #18382e; border-radius: 4px; opacity: ${({ disabled }) => disabled ? 0.35 : 1};`;
const FinishButtonText = styled.Text`color: #f4c94d; font-size: 16px; font-weight: 900;`;
const CompletedContent = styled.View`width: 100%; max-width: 620px; flex: 1; align-self: center; align-items: center; justify-content: center; padding: 40px 22px 130px;`;
const CompletedEyebrow = styled.Text`color: #d84929; font-size: 13px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;`;
const RankNumber = styled.Text`color: #d84929; font-size: 150px; font-weight: 900; letter-spacing: -10px; line-height: 165px;`;
const CompletedTitle = styled.Text`color: #18382e; font-size: 40px; font-weight: 900; letter-spacing: -1px; line-height: 43px; text-align: center;`;
const CompletedCopy = styled.Text`max-width: 440px; color: #53635d; font-size: 16px; line-height: 24px; text-align: center; margin: 16px 0 26px;`;
const RetakeButton = styled(Pressable)`padding: 16px; margin-top: 8px;`;
const RetakeText = styled.Text`color: #18382e; font-size: 14px; font-weight: 800; text-decoration-line: underline;`;
