import { useRouter } from 'expo-router';
import { useState } from 'react';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import {
  type AssessmentFlow,
  selectAssessmentRankBounds,
  selectAssessmentTricks,
  selectNextRankStartIndex,
} from '@/features/sesh/model/kentei-assessment-run';
import { OPEN_ENDED_SESH_PLAN } from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

type AssessmentEntryStep =
  | { readonly kind: 'choosingFlow' }
  | { readonly kind: 'choosingRank' }
  | { readonly kind: 'running'; readonly flow: AssessmentFlow };

/**
 * Entry point for a real, timed Kentei assessment run: lets the user pick
 * which slice of the rank ladder to be tested on, builds the ordered trick
 * list for that choice, and hands it to `MultiTrickSesh` (the shared
 * multi-trick practice core from T012). Landings recorded during the run go
 * through the same practice-history path as regular practice, so T007's
 * auto-promotion logic fires naturally on a full rank pass.
 *
 * Not to be confused with the self-declared placement quiz in
 * `src/features/onboarding/model/kentei-assessment.ts` — that's a one-time
 * onboarding estimate with its own reducer; this is real timed practice.
 */
export function AssessmentEntry() {
  const router = useRouter();
  const { kenteiRank } = useUserProfile();
  const { minRank, maxRank } = selectAssessmentRankBounds(KENDAMA_KENTEI_TRICKS);
  const [step, setStep] = useState<AssessmentEntryStep>({ kind: 'choosingFlow' });

  if (step.kind === 'running') {
    const tricks = selectAssessmentTricks(step.flow, KENDAMA_KENTEI_TRICKS);
    // Skipping only makes sense when there's a rank above the current one to
    // jump to — `currentRankOnly` covers a single rank, so "skip this rank"
    // would just mean abandoning the run, a different, unrequested action.
    const isMultiRankFlow = step.flow.kind !== 'currentRankOnly';
    return (
      <MultiTrickSesh
        tricks={tricks}
        plan={OPEN_ENDED_SESH_PLAN}
        onFinished={() => router.replace('/profile')}
        showAttemptsReminder
        skipTarget={isMultiRankFlow ? (index) => selectNextRankStartIndex(tricks, index) : undefined}
        endActionLabel="End assessment"
        skipCountdownBetweenTricks
        hideTimer
      />
    );
  }

  if (step.kind === 'choosingRank') {
    return (
      <Content>
        <Eyebrow>Kentei assessment</Eyebrow>
        <Title>Start from{`\n`}which rank?</Title>
        <Copy>You&rsquo;ll be assessed on this rank and every rank above it.</Copy>
        <RankGrid>
          {Array.from({ length: maxRank - minRank + 1 }, (_, index) => minRank + index).map(
            (rank) => (
              <RankChoice
                key={rank}
                accessibilityLabel={`Start from rank ${rank}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: false }}
                onPress={() =>
                  setStep({ kind: 'running', flow: { kind: 'fromRank', startingRank: rank } })
                }
              >
                <RankNumber>{rank}</RankNumber>
              </RankChoice>
            ),
          )}
        </RankGrid>
        <BackButton variant="secondary" onPress={() => setStep({ kind: 'choosingFlow' })}>
          Back
        </BackButton>
      </Content>
    );
  }

  return (
    <Content>
      <Eyebrow>Kentei assessment</Eyebrow>
      <Title>How do you{`\n`}want to test?</Title>
      <Copy>
        Every landing you record here counts as real practice history, so a full pass through
        a rank promotes you automatically.
      </Copy>
      <FlowButton
        onPress={() => setStep({ kind: 'running', flow: { kind: 'fullBottomToTop' } })}
      >
        Full assessment
      </FlowButton>
      <FlowHint>Every rank, from the very bottom up.</FlowHint>

      <FlowButton onPress={() => setStep({ kind: 'choosingRank' })}>
        Start from a rank
      </FlowButton>
      <FlowHint>Pick a rank and test everything from there up.</FlowHint>

      {kenteiRank ? (
        <>
          <FlowButton
            onPress={() =>
              setStep({ kind: 'running', flow: { kind: 'currentRankOnly', rank: kenteiRank } })
            }
          >
            Current rank only
          </FlowButton>
          <FlowHint>Just rank {kenteiRank}, your current frontier.</FlowHint>
        </>
      ) : null}
    </Content>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  justify-content: center;
  padding: 40px 22px 130px;
  align-self: center;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 500px;
  margin-top: 16px;
  color: ${AppColors.textMuted};
`;
const FlowButton = styled(Button).attrs({ fill: true, size: 'large' })`
  margin-top: 26px;
`;
const FlowHint = styled(BodyText)`
  font-size: 13px;
  margin-top: 8px;
`;
const RankGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
`;
const RankChoice = styled.Pressable`
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  background-color: ${AppColors.paperStrong};
  border: 2px solid ${AppColors.ink};
`;
const RankNumber = styled.Text`
  color: ${AppColors.ink};
  font-size: 20px;
  font-weight: 900;
`;
const BackButton = styled(Button)`
  align-self: flex-start;
  margin-top: 30px;
`;
