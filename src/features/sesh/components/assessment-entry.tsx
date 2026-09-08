import { useRouter } from 'expo-router';
import { useState } from 'react';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import {
  type AssessmentFlow,
  selectAssessmentGapNotice,
  selectAssessmentRankBounds,
  selectAssessmentResultCopy,
  selectAssessmentTricks,
  selectNextRankStartIndex,
  selectStartedAboveStoredRank,
} from '@/features/sesh/model/kentei-assessment-run';
import { OPEN_ENDED_SESH_PLAN } from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

type AssessmentEntryStep =
  | { readonly kind: 'choosingFlow' }
  | { readonly kind: 'choosingRank' }
  | {
      readonly kind: 'running';
      readonly flow: AssessmentFlow;
      readonly startingKenteiRank: number | undefined;
      readonly startedAboveStoredRank: boolean;
    };

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
  const [skippedDuringRun, setSkippedDuringRun] = useState(false);

  if (step.kind === 'running') {
    const tricks = selectAssessmentTricks(step.flow, KENDAMA_KENTEI_TRICKS);
    // Skipping only makes sense when there's a rank above the current one to
    // jump to — `currentRankOnly` covers a single rank, so "skip this rank"
    // would just mean abandoning the run, a different, unrequested action.
    const isMultiRankFlow = step.flow.kind !== 'currentRankOnly';
    const wasOutOfOrder = step.startedAboveStoredRank || skippedDuringRun;
    const gapNotice = selectAssessmentGapNotice(step.startingKenteiRank, kenteiRank, wasOutOfOrder);
    return (
      <MultiTrickSesh
        tricks={tricks}
        plan={OPEN_ENDED_SESH_PLAN}
        origin="assessment"
        suppressTransientCompletionFallback
        onFinished={() => router.navigate('/app/home')}
        finishButtonLabel="Go to Home"
        onCancelRun={() => setStep({ kind: 'choosingFlow' })}
        showAttemptsReminder
        skipTarget={isMultiRankFlow ? (index) => selectNextRankStartIndex(tricks, index) : undefined}
        describeSkippedRange={
          isMultiRankFlow
            ? (start, end) => {
                // Called during MultiTrickSesh render, to preview the skip confirmation
                // description, as well as from its confirm handler. Deferring the state
                // update via a resolved-Promise microtask (queueMicrotask itself is faked
                // by jest fake timers in this suite and never flushes) avoids a synchronous
                // setState-during-a-different-components-render warning while still
                // landing before the run reaches its wrap-up screen.
                Promise.resolve().then(() => setSkippedDuringRun(true));
                const count = end - start;
                return `Rank ${tricks[start].kenteiRank} — ${count} trick${count === 1 ? '' : 's'} skipped`;
              }
            : undefined
        }
        endActionLabel="End assessment"
        skipCountdownBetweenTricks
        hideTimer
        advanceOnFirstLace
        showRankStanding
        wrapUpFooter={
          <>
          <ResultCopy accessibilityLabel="Assessment result">
            {selectAssessmentResultCopy(step.startingKenteiRank, kenteiRank)}
          </ResultCopy>
          {gapNotice ? (
            <GapNotice accessibilityLabel="Assessment gap notice">{gapNotice}</GapNotice>
          ) : null}
          </>
        }
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
                onPress={() => {
                    setSkippedDuringRun(false);
                    setStep({
                      kind: 'running',
                      flow: { kind: 'fromRank', startingRank: rank },
                      startingKenteiRank: kenteiRank,
                      startedAboveStoredRank: selectStartedAboveStoredRank(
                        { kind: 'fromRank', startingRank: rank },
                        kenteiRank,
                        minRank,
                      ),
                    });
                  }}
              >
                <RankNumber>{rank}</RankNumber>
              </RankChoice>
            ),
          )}
        </RankGrid>
        {kenteiRank !== undefined ? (
          <GapHint>
            Ranks above {kenteiRank} won&rsquo;t count toward promotion until Rank {kenteiRank} and
            everything below it are cleared.
          </GapHint>
        ) : null}
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
        onPress={() => {
          setSkippedDuringRun(false);
          setStep({
            kind: 'running',
            flow: { kind: 'fullBottomToTop' },
            startingKenteiRank: kenteiRank,
            startedAboveStoredRank: false,
          });
        }}
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
            onPress={() => {
              setSkippedDuringRun(false);
              setStep({
                kind: 'running',
                flow: { kind: 'currentRankOnly', rank: kenteiRank },
                startingKenteiRank: kenteiRank,
                startedAboveStoredRank: false,
              });
            }}
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
  color: ${({ theme }) => theme.text};
  font-size: 20px;
  font-weight: 900;
`;
const BackButton = styled(Button)`
  align-self: flex-start;
  margin-top: 30px;
`;
const ResultCopy = styled(BodyText)`
  margin-top: 28px;
  text-align: center;
  font-weight: 800;
`;
const GapNotice = styled(BodyText)`
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
`;
const GapHint = styled(BodyText)`
  margin-top: 18px;
  font-size: 13px;
  max-width: 500px;
`;
